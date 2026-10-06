'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.GOBOOKR_PGLITE_MODULE || '@electric-sql/pglite');
const { createStore } = require('../lib/ai-ops/store');
const policy = require('../lib/ai-ops/policy');
const snapshot = {profile_id:42,missing_fields:['description'],booking_status:'unverified',source_age_days:120};
async function fixture() {
  const db = new PGlite();
  const sql=fs.readFileSync(path.join(__dirname,'../db/ai-ops/schema.sql'),'utf8');
  await db.exec(sql);
  await db.exec(sql); // Installation artifact is repeatable.
  await db.exec("CREATE TABLE public.domain_sentinel(id INTEGER PRIMARY KEY,value TEXT); INSERT INTO public.domain_sentinel VALUES(1,'unchanged')");
  // PGlite has one connection: serialize transactions. PostgreSQL worker concurrency
  // is guarded by row locks; multi-connection load tests remain a rollout gate.
  let previous=Promise.resolve();
  const pool={
    query:(sql,args)=>db.query(sql,args),
    async connect() {
      let release;
      const next=new Promise(resolve=>{release=resolve;});
      const wait=previous; previous=next; await wait;
      return {query:(sql,args)=>db.query(sql,args),release};
    }
  };
  return {db,pool,store:createStore(pool)};
}
test('strict snapshots reject secrets, unknown jobs, malformed observations and nonfinite usage',async()=>{
  assert.equal(policy.MODULES.length,10);
  assert.throws(()=>policy.validateInput({...snapshot,email:'private@example.test'}),/Unapproved/);
  assert.throws(()=>policy.validateInput({...snapshot,missing_fields:['secret']}),/Invalid/);
  assert.throws(()=>policy.validateInput({...snapshot,source_age_days:NaN}),/Invalid/);
  assert.throws(()=>policy.authorizeJob('trust_safety.ban'),/disabled/);
  assert.equal(policy.hashInput({...snapshot,missing_fields:['photo','description','photo']}),policy.hashInput({...snapshot,missing_fields:['description','photo']}));
  assert.equal(policy.estimateMicrousd({inputTokens:2000,outputTokens:600,inputUsdPerMillion:1,outputUsdPerMillion:5}),5000);
  assert.throws(()=>policy.estimateMicrousd({inputTokens:-1,outputTokens:600,inputUsdPerMillion:1,outputUsdPerMillion:5}),/Invalid/);
  const result=await policy.rulesAdapter.generate(snapshot);
  assert.equal(result.costMicrousd,0); assert.equal(result.findings.length,3);
  assert.throws(()=>policy.validateFindings([{code:'ban_account',field:null,confidence:1}]),/Invalid/);
});
test('durable jobs dedupe, reject changed input, fence leases and record findings/cost atomically',async()=>{
  const {db,pool,store}=await fixture();
  try {
    const job=await store.enqueue('data_quality.snapshot.v1','profile:42:v1',snapshot);
    assert.equal((await store.enqueue(job.kind,'profile:42:v1',snapshot)).id,job.id);
    await assert.rejects(store.enqueue(job.kind,'profile:42:v1',{...snapshot,booking_status:'working'}),/conflict/);
    await assert.rejects(store.enqueue('billing.charge','bad',snapshot),/disabled/);
    const leased=await store.lease();
    assert.equal(leased.id,job.id);
    assert.equal(await store.lease(),null);
    await assert.rejects(store.complete(job.id,'00000000-0000-0000-0000-000000000000'),/lease/);
    const findings=await store.complete(job.id,leased.lease_token);
    assert.equal(findings.length,3);
    await assert.rejects(store.complete(job.id,leased.lease_token),/lease/);
    const records=(await db.query('SELECT * FROM ai_ops.findings')).rows;
    assert.equal(records.length,3);
    await assert.rejects(store.decide(records[0].id,job.input_hash,9,'approved'),/denied/);
    const reviewer=createStore(pool,{authorizeHuman:async actor=>actor===9});
    await assert.rejects(reviewer.decide(records[0].id,'f'.repeat(64),9,'approved'),/Stale/);
    assert.equal((await reviewer.decide(records[0].id,job.input_hash,9,'approved')).status,'approved');
    await assert.rejects(reviewer.decide(records[0].id,job.input_hash,9,'rejected'),/Stale/);
    await reviewer.decide(records[1].id,job.input_hash,9,'rejected');
    const month=new Date().toISOString().slice(0,7)+'-01';
    assert.deepEqual(await store.monthlyUsage(42,month),{runs:1,cost_microusd:'0'});
    const events=(await db.query('SELECT event_type FROM ai_ops.events ORDER BY id')).rows.map(x=>x.event_type);
    assert.deepEqual(events,['enqueued','leased','completed','approved','rejected']);
    assert.equal((await db.query('SELECT value FROM public.domain_sentinel')).rows[0].value,'unchanged');
    assert.equal((await db.query("SELECT count(*)::INTEGER AS n FROM ai_ops.jobs WHERE status='completed'")).rows[0].n,1);
    assert.equal((await db.query("SELECT count(*)::INTEGER AS n FROM pg_class c JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='ai_ops' AND c.relkind='r' AND c.relrowsecurity")).rows[0].n,4);
    await db.exec('CREATE ROLE ai_ops_untrusted NOLOGIN; SET ROLE ai_ops_untrusted');
    await assert.rejects(db.query('SELECT * FROM ai_ops.jobs'),/permission denied/);
    await db.exec('RESET ROLE');
    // Even accidental SELECT grants cannot expose rows without an RLS policy.
    await db.exec('GRANT USAGE ON SCHEMA ai_ops TO ai_ops_untrusted; GRANT SELECT ON ai_ops.jobs TO ai_ops_untrusted; SET ROLE ai_ops_untrusted');
    assert.equal((await db.query('SELECT * FROM ai_ops.jobs')).rows.length,0);
    await db.exec('RESET ROLE');
    await assert.rejects(db.query("UPDATE ai_ops.findings SET reviewer_id=NULL WHERE status='approved'"),/check constraint/);
  } finally {await db.close();}
});
test('expired workers cannot complete; retries are bounded and recoverable jobs are leased once',async()=>{
  const {db,store}=await fixture();
  try {
    const first=await store.enqueue('data_quality.snapshot.v1','one',snapshot);
    const second=await store.enqueue('data_quality.snapshot.v1','two',{...snapshot,profile_id:43});
    const jobs=await Promise.all([store.lease(),store.lease()]);
    assert.notEqual(jobs[0].id,jobs[1].id);
    const job=jobs.find(j=>j.id===first.id);
    await db.query("UPDATE ai_ops.jobs SET lease_until=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=$1",[first.id]);
    await assert.rejects(store.complete(first.id,job.lease_token),/expired/);
    const reclaimed=await store.lease();
    assert.equal(reclaimed.id,first.id); assert.equal(reclaimed.attempts,2);
    assert.notEqual(reclaimed.lease_token,job.lease_token);
    await assert.rejects(store.complete(first.id,job.lease_token),/lease/);
    assert.equal(await store.retry(first.id,reclaimed.lease_token),'queued');
    await db.query("UPDATE ai_ops.jobs SET available_at=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=$1",[first.id]);
    const final=await store.lease();
    assert.equal(final.attempts,3);
    assert.equal(await store.retry(first.id,final.lease_token),'dead');
    const other=jobs.find(j=>j.id===second.id);
    await db.query("UPDATE ai_ops.jobs SET attempts=3,lease_until=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE id=$1",[second.id]);
    assert.equal(await store.lease(),null);
    assert.equal((await db.query('SELECT status FROM ai_ops.jobs WHERE id=$1',[second.id])).rows[0].status,'dead');
    await assert.rejects(store.complete(second.id,other.lease_token),/lease/);
  } finally {await db.close();}
});
