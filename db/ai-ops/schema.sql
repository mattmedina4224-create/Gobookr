-- Manual Phase 1 installation artifact. NOT loaded by the application.
-- Apply only to an isolated operations database first; no public-domain tables are altered.
CREATE SCHEMA IF NOT EXISTS ai_ops;
REVOKE ALL ON SCHEMA ai_ops FROM PUBLIC;
CREATE TABLE IF NOT EXISTS ai_ops.jobs (
  id UUID PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind = 'data_quality.snapshot.v1'),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  profile_id BIGINT NOT NULL CHECK (profile_id > 0),
  input JSONB NOT NULL,
  input_hash TEXT NOT NULL CHECK (length(input_hash) = 64),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','dead')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ai_ops_jobs_due ON ai_ops.jobs(available_at,created_at) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS ai_ops_jobs_expired ON ai_ops.jobs(lease_until) WHERE status='running';
CREATE TABLE IF NOT EXISTS ai_ops.findings (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES ai_ops.jobs(id),
  input_hash TEXT NOT NULL CHECK (length(input_hash)=64),
  code TEXT NOT NULL CHECK (code IN ('missing_field','booking_unavailable','booking_unverified','stale_source')),
  field TEXT CHECK (field IN ('description','categories','booking_link','address','photo')),
  confidence NUMERIC NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewer_id BIGINT,
  decided_at TIMESTAMPTZ,
  CHECK ((status = 'pending' AND reviewer_id IS NULL AND decided_at IS NULL) OR
    (status <> 'pending' AND reviewer_id IS NOT NULL AND reviewer_id > 0 AND decided_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ai_ops_findings_pending ON ai_ops.findings(job_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS ai_ops.events (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES ai_ops.jobs(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('enqueued','leased','completed','retry','dead','approved','rejected')),
  actor_id BIGINT CHECK (actor_id IS NULL OR actor_id > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ai_ops_events_job ON ai_ops.events(job_id,id);
CREATE TABLE IF NOT EXISTS ai_ops.usage (
  job_id UUID NOT NULL REFERENCES ai_ops.jobs(id),
  attempt INTEGER NOT NULL CHECK (attempt BETWEEN 1 AND 3),
  profile_id BIGINT NOT NULL,
  provider TEXT NOT NULL CHECK (provider='rules'),
  model TEXT NOT NULL CHECK (model='profile-snapshot-v1'),
  input_tokens INTEGER NOT NULL CHECK (input_tokens=0),
  output_tokens INTEGER NOT NULL CHECK (output_tokens=0),
  cost_microusd BIGINT NOT NULL CHECK (cost_microusd=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(job_id,attempt)
);
CREATE INDEX IF NOT EXISTS ai_ops_usage_profile_month ON ai_ops.usage(profile_id,created_at);
ALTER TABLE ai_ops.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_ops.findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_ops.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_ops.usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA ai_ops FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA ai_ops FROM PUBLIC;
-- No role grants or policies supplied here. Dedicated backend roles and limited
-- policies must be reviewed before activation. No anon/authenticated access.
