-- Explicit server-controlled grants. No existing account is promoted.
BEGIN;
CREATE TABLE public.admin_accounts (
  user_id BIGINT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.admin_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_accounts FROM PUBLIC;
-- These roles exist on Supabase; keep isolated Postgres testing portable.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.admin_accounts FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.admin_accounts FROM authenticated;
  END IF;
END $$;
-- No public policies: only the trusted server/operator DB role can access grants.
COMMIT;
