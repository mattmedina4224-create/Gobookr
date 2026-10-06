'use strict';
const { randomUUID } = require('node:crypto');
const { authorizeJob, validateInput, hashInput, evaluateProfile, estimateMicrousd } = require('./policy');

// Inject a dedicated async pg Pool. Never import the application's broad-access db.
function createStore(pool, { authorizeHuman = async () => false } = {}) {
  async function transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  const audit = (client,id,type,actor=null) => client.query('INSERT INTO ai_ops.events(job_id,event_type,actor_id) VALUES($1,$2,$3)',[id,type,actor]);
  async function enqueue(kind, key, raw) {
    authorizeJob(kind);
    if (typeof key !== 'string' || !/^[a-zA-Z0-9:_-]{1,128}$/.test(key)) throw new Error('Invalid idempotency key');
    const input=validateInput(raw), hash=hashInput(input);
    return transaction(async c => {
      const inserted = await c.query('INSERT INTO ai_ops.jobs(id,kind,idempotency_key,profile_id,input,input_hash) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(idempotency_key) DO NOTHING RETURNING *',[randomUUID(),kind,key,input.profile_id,JSON.stringify(input),hash]);
      const job=inserted.rows[0] || (await c.query('SELECT * FROM ai_ops.jobs WHERE idempotency_key=$1',[key])).rows[0];
      if (job.input_hash !== hash || job.kind !== kind) throw new Error('Idempotency conflict');
      if (inserted.rows.length) await audit(c,job.id,'enqueued');
      return job;
    });
  }
  async function lease() {
    return transaction(async c => {
      const dead=await c.query("WITH expired AS (SELECT id FROM ai_ops.jobs WHERE status='running' AND lease_until<CURRENT_TIMESTAMP AND attempts>=3 ORDER BY lease_until FOR UPDATE SKIP LOCKED LIMIT 100) UPDATE ai_ops.jobs j SET status='dead',lease_token=NULL,lease_until=NULL FROM expired e WHERE j.id=e.id RETURNING j.id");
      for (const row of dead.rows) await audit(c,row.id,'dead');
      const selected=await c.query("SELECT id FROM ai_ops.jobs WHERE attempts<3 AND ((status='queued' AND available_at<=CURRENT_TIMESTAMP) OR (status='running' AND lease_until<CURRENT_TIMESTAMP)) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1");
      if (!selected.rows.length) return null;
      const job=(await c.query("UPDATE ai_ops.jobs SET status='running',attempts=attempts+1,lease_token=$2,lease_until=CURRENT_TIMESTAMP+INTERVAL '60 seconds' WHERE id=$1 RETURNING *",[selected.rows[0].id,randomUUID()])).rows[0];
      await audit(c,job.id,'leased');
      return job;
    });
  }
  async function locked(c,id,token) {
    const job=(await c.query("SELECT * FROM ai_ops.jobs WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>CURRENT_TIMESTAMP FOR UPDATE",[id,token])).rows[0];
    if (!job) throw new Error('Invalid or expired lease');
    authorizeJob(job.kind);
    if (hashInput(job.input) !== job.input_hash) throw new Error('Snapshot integrity failure');
    return job;
  }
  async function complete(id, token) {
    return transaction(async c => {
      const job=await locked(c,id,token);
      // Compute internally, not from arbitrary caller/model output.
      const findings=evaluateProfile(job.input);
      for (const f of findings) await c.query('INSERT INTO ai_ops.findings(id,job_id,input_hash,code,field,confidence) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),id,job.input_hash,f.code,f.field,f.confidence]);
      await c.query("INSERT INTO ai_ops.usage(job_id,attempt,profile_id,provider,model,input_tokens,output_tokens,cost_microusd) VALUES($1,$2,$3,'rules','profile-snapshot-v1',0,0,0)",[id,job.attempts,job.profile_id]);
      await c.query("UPDATE ai_ops.jobs SET status='completed',completed_at=CURRENT_TIMESTAMP,lease_token=NULL,lease_until=NULL WHERE id=$1",[id]);
      await audit(c,id,'completed');
      return findings;
    });
  }
  async function retry(id,token) {
    return transaction(async c => {
      const job=await locked(c,id,token), status=job.attempts>=3?'dead':'queued';
      await c.query("UPDATE ai_ops.jobs SET status=$2,available_at=CURRENT_TIMESTAMP+INTERVAL '30 seconds',lease_token=NULL,lease_until=NULL WHERE id=$1",[id,status]);
      await audit(c,id,status==='dead'?'dead':'retry');
      return status;
    });
  }
  async function decide(id, expectedHash, actor, decision) {
    if (!Number.isSafeInteger(actor) || actor<=0 || !['approved','rejected'].includes(decision)
      || typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash) || !await authorizeHuman(actor)) throw new Error('Human approval denied');
    return transaction(async c => {
      const finding=(await c.query('UPDATE ai_ops.findings SET status=$4,reviewer_id=$3,decided_at=CURRENT_TIMESTAMP WHERE id=$1 AND input_hash=$2 AND status=\'pending\' RETURNING *',[id,expectedHash,actor,decision])).rows[0];
      if (!finding) throw new Error('Stale or already decided finding');
      await audit(c,finding.job_id,decision,actor);
      // Approval is a disposition of evidence, NOT an execution capability.
      return finding;
    });
  }
  async function monthlyUsage(profileId, month) {
    if (!Number.isSafeInteger(profileId) || profileId<=0 || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(month)) throw new Error('Invalid usage query');
    return (await pool.query("SELECT COUNT(*)::INTEGER AS runs,COALESCE(SUM(cost_microusd),0)::TEXT AS cost_microusd FROM ai_ops.usage WHERE profile_id=$1 AND created_at >= $2::date AND created_at < $2::date+INTERVAL '1 month'",[profileId,month])).rows[0];
  }
  return { enqueue, lease, complete, retry, decide, monthlyUsage };
}
module.exports = { createStore, estimateMicrousd };
