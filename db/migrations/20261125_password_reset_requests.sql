-- Database-backed rate limit for password-reset requests (shared by all serverless instances).
-- Stores only SHA-256 hashes of the normalized email / client address, never the raw values.
-- Additive and idempotent. Rollback: DROP TABLE IF EXISTS public.password_reset_requests;

CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id BIGSERIAL PRIMARY KEY,
  key_hash TEXT NOT NULL CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_key_time ON public.password_reset_requests (key_hash, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_requests_time ON public.password_reset_requests (requested_at);

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.password_reset_requests FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE public.password_reset_requests FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE public.password_reset_requests FROM authenticated; END IF;
END $$;
