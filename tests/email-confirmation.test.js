'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Worker, MessageChannel, receiveMessageOnPort } = require('node:worker_threads');
const { createConfirmation, configured, confirmationEmail } = require('../lib/email-confirmation');

const env = { PROFILE_EMAIL_CONFIRMATION_ENABLED:'1', RESEND_API_KEY:'test-only-not-a-real-key', PROFILE_EMAIL_FROM:'GoBookr <test@example.test>', EMAIL_VERIFICATION_SECRET:'test-only-secret-with-at-least-32-characters' };
function database() {
  const worker = new Worker(path.join(__dirname, 'helpers/claim-postgres-worker.js'));
  function call(op, sql, args = []) {
    const signalBuffer = new SharedArrayBuffer(4);
    const {port1,port2} = new MessageChannel();
    worker.postMessage({op,sql,args,signalBuffer,responsePort:port2},[port2]);
    assert.notEqual(Atomics.wait(new Int32Array(signalBuffer),0,0,30000),'timed-out');
    const result = receiveMessageOnPort(port1).message; port1.close();
    if(result.error) throw Error(result.error);
    return result.value;
  }
  return {exec:sql=>call('exec',sql),prepare:sql=>({get:(...a)=>call('get',sql,a),run:(...a)=>call('run',sql,a)}),close:async()=>{call('close','');await worker.terminate();}};
}
async function fixture(run) {
  const db = database(); const messages = []; let failure = false;
  try {
    db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE users(id BIGINT PRIMARY KEY,email TEXT,role TEXT);
      CREATE TABLE pro_profiles(id BIGINT PRIMARY KEY,user_id BIGINT, onboarding_completed INTEGER);
      INSERT INTO users VALUES (1,'pro@example.test','pro'),(2,'other@example.test','pro'),(3,'customer@example.test','customer');
      INSERT INTO pro_profiles VALUES (11,1,1),(22,2,1),(33,3,1);`);
    db.exec(fs.readFileSync(path.join(__dirname,'../db/migrations/20261015210847_profile_email_confirmations.sql'),'utf8'));
    const service = createConfirmation({db,env,fetchEmail:async(url,options)=>{
      assert.equal(url,'https://api.resend.com/emails');
      const body = JSON.parse(options.body); messages.push(body);
      assert.match(options.headers['Idempotency-Key'],/^profile-email-/);
      return {ok:!failure,json:async()=>({id:'fixture-message'})};
    }});
    const account = service.identity(1);
    const code = () => messages.at(-1).subject.match(/^\d{6}/)[0];
    const cooldown = () => db.exec("UPDATE profile_email_confirmations SET requested_at = CURRENT_TIMESTAMP - INTERVAL '61 seconds'");
    await run({db,service,account,messages,code,cooldown,fail:()=>{failure=true;}});
  } finally { await db.close(); }
}

test('confirmation is opt-in and templates contain the readable code and fixed HTTPS return link',()=>{
  assert.equal(configured({}),false);assert.equal(configured({...env,EMAIL_VERIFICATION_SECRET:''}),false);assert.equal(configured(env),true);
  const email = confirmationEmail('012345');assert.match(email.subject,/012345/);assert.match(email.text,/012345/);assert.match(email.html,/012345/);
  assert.match(email.html,/https:\/\/gobookr.com\/dashboard\/pro\/confirm-email/);
  assert.throws(()=>confirmationEmail('<img>'));
});

test('real Postgres stores a digest, verifies the delivered code once, and binds it to the account',async()=>fixture(async({db,service,account,messages,code})=>{
  assert.equal(service.identity(3),undefined);
  assert.equal((await service.sendCode(account)).status,'sent');assert.deepEqual(messages[0].to,['pro@example.test']);
  const row = db.prepare('SELECT * FROM profile_email_confirmations WHERE pro_id = ?').get(11);
  assert.notEqual(row.code_digest,code());assert.equal(row.code_digest.length,64);
  assert.equal(service.verify(service.identity(2),code()),false);
  const formatted = code().slice(0,3)+' '+code().slice(3);
  assert.equal(service.verify(account,formatted),true);assert.ok(service.state(account).verified_at);
  assert.equal(service.verify(account,code()),false);
  assert.equal(db.prepare('SELECT code_digest FROM profile_email_confirmations WHERE pro_id = ?').get(11).code_digest,null);
}));

test('resends enforce cooldown, supersede the old code, and cap requests across service instances',async()=>fixture(async({db,service,account,code,cooldown})=>{
  await service.sendCode(account);const oldCode=code();assert.equal((await service.sendCode(account)).status,'limited');
  cooldown();await service.sendCode(account);const newCode=code();
  // Random codes may coincide; force old-digest invalidation independently.
  if(oldCode!==newCode)assert.equal(service.verify(account,oldCode),false);
  assert.equal(service.verify(account,newCode),true);
  db.exec('UPDATE profile_email_confirmations SET verified_at=NULL');
  for(let i=0;i<3;i++){cooldown();assert.equal((await service.sendCode(account)).status,'sent');}
  cooldown();assert.equal((await service.sendCode(account)).status,'limited');
  db.exec("UPDATE profile_email_confirmations SET window_started_at=CURRENT_TIMESTAMP - INTERVAL '61 minutes'");
  assert.equal((await service.sendCode(account)).status,'sent');
}));

test('expiry, five wrong attempts, delivery failure and email changes cannot confirm the account',async()=>fixture(async({db,service,account,code,cooldown,fail})=>{
  await service.sendCode(account);const correct=code();
  const wrong = correct==='000000'?'111111':'000000';
  for(let i=0;i<5;i++)assert.equal(service.verify(account,wrong),false);
  assert.equal(service.verify(account,correct),false);
  cooldown();await service.sendCode(account);
  db.exec("UPDATE profile_email_confirmations SET expires_at=CURRENT_TIMESTAMP - INTERVAL '1 second'");
  assert.equal(service.verify(account,code()),false);
  cooldown();await service.sendCode(account);db.exec("UPDATE users SET email='changed@example.test' WHERE id=1");
  assert.equal(service.verify(account,code()),false);
  cooldown();fail();assert.equal((await service.sendCode(service.identity(1))).status,'failed');
  assert.equal(service.verify(service.identity(1),code()),false);
}));

function routes(service) {
  const handlers = new Map();const module = {exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../routes/pro-email-confirmation.js'),'utf8'),{module,require:name=>{
    if(name==='../lib/layout')return {layout:({body})=>body};
    return require(path.resolve(__dirname,'../routes',name));
  }});
  module.exports({get:(p,fn)=>handlers.set('GET '+p,fn),post:(p,fn)=>handlers.set('POST '+p,fn)},service);
  return {afterPublish:module.exports.afterPublish,render:module.exports.renderConfirmation,request:async(method,path,user={id:1,role:'pro'},body={},query={})=>{
    const res={setHeader(){},writeHead(status,headers){this.status=status;this.headers=headers;},end(html){this.html=html;}};
    await handlers.get(method+' '+path)({currentUser:user,body,query,session:{csrf_token:'fixture-csrf'},res});return res;
  }};
}
test('route renders phone AutoFill, keeps sending on POST, and handles auth, errors, success and unavailable delivery',async()=>fixture(async({service,messages})=>{
  const r=routes(service);const page='/dashboard/pro/confirm-email';
  const screen=await r.request('GET',page);assert.match(screen.html,/autocomplete="one-time-code"/);assert.match(screen.html,/inputmode="numeric"/);assert.match(screen.html,/fixture-csrf/);assert.equal(messages.length,0);
  assert.match((await r.request('GET',page,null)).headers.Location,/login/);
  assert.match((await r.request('GET',page,{id:3,role:'customer'})).headers.Location,/login/);
  assert.equal((await r.request('POST',page,{id:1,role:'pro'},{code:'999999'})).status,422);
  assert.equal((await r.request('POST',page+'/resend')).status,302);
  const code=messages[0].subject.slice(0,6);assert.match((await r.request('POST',page,{id:1,role:'pro'},{code})).html,/Email confirmed/);
  const unavailable=routes({...service,enabled:()=>false});assert.match((await unavailable.request('GET',page)).html,/temporarily unavailable/);
  assert.doesNotMatch((await unavailable.request('GET',page)).html,/name="code"/);
}));

test('after publishing sends once then opens confirmation, but failures never undo publication',async()=>fixture(async({service,messages,account})=>{
  const r=routes(service);const res={writeHead(status,headers){this.headers=headers;},end(){}};
  const ctx={currentUser:{id:1},res};assert.equal(await r.afterPublish(ctx,service),true);assert.match(res.headers.Location,/confirm-email\?sent=1/);assert.equal(messages.length,1);
  assert.equal(await r.afterPublish(ctx,{...service,enabled:()=>false}),false);
  assert.equal(await r.afterPublish(ctx,{...service,identity(){throw Error('database unavailable');}}),false);
  assert.equal(service.verify(account,messages[0].subject.slice(0,6)),true);
  assert.equal(await r.afterPublish(ctx,service),false);assert.equal(messages.length,1);
}));
