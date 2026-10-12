'use strict';
const crypto = require('node:crypto');
const SCOPES = ['pages_show_list','pages_read_engagement','pages_manage_posts','instagram_basic','instagram_content_publish'];

function settings() {
  const env = process.env;
  let origin = '';
  try { const url = new URL(env.APP_URL || 'https://gobookr.com'); if (url.protocol === 'https:' && !url.username && !url.password) origin = url.origin; } catch (_) {}
  return { appId: String(env.META_APP_ID || '').trim(), secret: String(env.META_APP_SECRET || '').trim(),
    version: String(env.META_GRAPH_VERSION || '').trim(), key: String(env.META_TOKEN_ENCRYPTION_KEY || '').trim(),
    callback: origin ? origin + '/integrations/meta/callback' : '', enabled: env.META_CONNECTIONS_ENABLED === '1',
    testers: String(env.META_TEST_PRO_IDS || '').split(',').map(s=>Number(s.trim())).filter(id=>Number.isSafeInteger(id)&&id>0) };
}
function readiness() {
  const c = settings();
  return [{key:'META_APP_ID',ready:/^\d+$/.test(c.appId)}, {key:'META_APP_SECRET',ready:c.secret.length>=8},
    {key:'META_GRAPH_VERSION',ready:/^v\d+\.\d+$/.test(c.version)}, {key:'META_TOKEN_ENCRYPTION_KEY',ready:/^[a-f0-9]{64}$/i.test(c.key)},
    {key:'APP_URL (HTTPS)',ready:Boolean(c.callback)}, {key:'META_TEST_PRO_IDS',ready:c.testers.length>0},
    {key:'META_CONNECTIONS_ENABLED',ready:c.enabled}];
}
function canConnect(proId) { return readiness().every(item=>item.ready) && settings().testers.includes(Number(proId)); }
function fingerprint(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function sessionHash(ctx) { if (!ctx.session?.token) throw Error('Session required'); return fingerprint(ctx.session.token); }
function encrypt(value, context) {
  const key = settings().key; if (!/^[a-f0-9]{64}$/i.test(key)) throw Error('Encryption unavailable');
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
  cipher.setAAD(Buffer.from(context));
  const payload = Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return ['v1',iv.toString('hex'),cipher.getAuthTag().toString('hex'),payload.toString('hex')].join('.');
}
function decrypt(value, context) {
  const parts = String(value).split('.'), key=settings().key;
  if (parts.length!==4 || parts[0]!=='v1' || !/^[a-f0-9]{64}$/i.test(key)) throw Error('Invalid encrypted connection');
  const decipher = crypto.createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(parts[1],'hex'));
  decipher.setAAD(Buffer.from(context));decipher.setAuthTag(Buffer.from(parts[2],'hex'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(parts[3],'hex')),decipher.final()]).toString('utf8'));
}
function authorizationUrl(state) {
  const c=settings(),url=new URL(`https://www.facebook.com/${c.version}/dialog/oauth`);
  for(const [key,value] of Object.entries({client_id:c.appId,redirect_uri:c.callback,state,response_type:'code',scope:SCOPES.join(','),auth_type:'rerequest'})) url.searchParams.set(key,value);
  return url.href;
}
async function graph(path, token, params={}) {
  const c=settings(),url=new URL(`https://graph.facebook.com/${c.version}/${path}`);
  for(const [key,value] of Object.entries(params)) url.searchParams.set(key,String(value));
  if(token)url.searchParams.set('appsecret_proof',crypto.createHmac('sha256',c.secret).update(token).digest('hex'));
  const response=await fetch(url,{headers:token?{authorization:'Bearer '+token}:{},redirect:'error',signal:AbortSignal.timeout(10000)});
  let data;try{data=await response.json();}catch(_){throw Error('Meta request failed');}
  // Provider responses/URLs may contain credentials; never surface raw errors.
  if(!response.ok||data.error)throw Error('Meta request failed');return data;
}
async function discoverPages(code) {
  const c=settings();
  const token=await graph('oauth/access_token',null,{client_id:c.appId,client_secret:c.secret,redirect_uri:c.callback,code});
  if(typeof token.access_token!=='string'||!token.access_token||token.access_token.length>20000)throw Error('Meta token unavailable');
  const permissions=await graph('me/permissions',token.access_token);
  const granted=new Set((permissions.data||[]).filter(p=>p.status==='granted').map(p=>p.permission));
  if(!['pages_show_list','pages_read_engagement','pages_manage_posts'].every(s=>granted.has(s)))throw Error('Required Page permissions were not granted');
  const result=await graph('me/accounts',token.access_token,{fields:'id,name,access_token,tasks,instagram_business_account',limit:50});
  const expires=Number(token.expires_in);if(!Number.isFinite(expires)||expires<=0)throw Error('Meta token expiry unavailable');
  const expiresAt=new Date(Date.now()+Math.min(expires,60*86400)*1000).toISOString();
  const pages=(Array.isArray(result.data)?result.data:[]).filter(p=>/^\d+$/.test(String(p.id))&&typeof p.access_token==='string'&&p.access_token&&p.access_token.length<=20000&&Array.isArray(p.tasks)&&(p.tasks.includes('CREATE_CONTENT')||p.tasks.includes('MANAGE'))).slice(0,50).map(p=>({id:String(p.id),name:String(p.name||'Facebook Page').slice(0,200),token:p.access_token,expiresAt,
    instagramId:granted.has('instagram_basic')&&granted.has('instagram_content_publish')&&/^\d+$/.test(String(p.instagram_business_account?.id))?String(p.instagram_business_account.id):null}));
  if(!pages.length)throw Error('No authorized publishing Pages found');
  return {pages,more:Boolean(result.paging?.next)};
}
module.exports={SCOPES,settings,readiness,canConnect,fingerprint,sessionHash,encrypt,decrypt,authorizationUrl,discoverPages};
