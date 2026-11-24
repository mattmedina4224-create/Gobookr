-- One-time administrator provisioning with owner authorization, email-control verification and an audit trail.
-- The permissions model is unchanged: access is still a row in public.admin_accounts, checked by lib/admin.js.
--
-- Flow
--   1. The GoBookr project owner authorizes a specific user ID + exact email through the trusted database channel
--      (SQL console / scripts/admin-grant.js), via admin_grant_authorize(). Nothing is granted.
--   2. That user, signed in to that exact account, asks for a one-time code; the server emails it to the account's
--      address (admin_grant_set_code stores only an HMAC of the code).
--   3. The user enters the code. admin_grant_verify() checks everything in one transaction and only then inserts the
--      admin_accounts row, records the audit entry and signs the account out everywhere.
-- No application route can create an authorization. Functions are owned by the migration role; anon/authenticated
-- cannot execute them or read the tables.
--
-- Rollback (only if no grant was made through it):
--   DROP FUNCTION IF EXISTS admin_grant_authorize(BIGINT, TEXT, TEXT, TEXT), admin_grant_set_code(BIGINT, BIGINT, TEXT, TEXT),
--     admin_grant_verify(BIGINT, BIGINT, TEXT, TEXT), admin_grant_cancel(BIGINT, TEXT);
--   DROP TABLE IF EXISTS admin_grant_requests; -- keep admin_grant_audit as a record.

CREATE TABLE IF NOT EXISTS public.admin_grant_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,                              -- exact email at authorization time; must still match at grant time
  owner_approver TEXT NOT NULL CHECK (char_length(btrim(owner_approver)) BETWEEN 3 AND 200),
  owner_note TEXT NOT NULL DEFAULT '',
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
  code_hash TEXT,
  code_expires_at TIMESTAMPTZ,
  codes_sent INTEGER NOT NULL DEFAULT 0,
  last_code_sent_at TIMESTAMPTZ,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  email_verified_at TIMESTAMPTZ,
  granted_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  cancel_reason TEXT
);
-- At most one open authorization per user.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_admin_grant_open ON public.admin_grant_requests (user_id) WHERE granted_at IS NULL AND canceled_at IS NULL;

CREATE TABLE IF NOT EXISTS public.admin_grant_audit (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT,
  user_id BIGINT NOT NULL,
  email TEXT NOT NULL,
  event TEXT NOT NULL CHECK (event IN ('authorized', 'code_sent', 'code_rejected', 'verified_and_granted', 'canceled', 'expired', 'locked')),
  actor TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_grant_audit_user ON public.admin_grant_audit (user_id, id);

-- The audit trail is append-only.
CREATE OR REPLACE FUNCTION public.admin_grant_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'admin_grant_audit is append-only'; END $$;
DROP TRIGGER IF EXISTS admin_grant_audit_no_change ON public.admin_grant_audit;
CREATE TRIGGER admin_grant_audit_no_change BEFORE UPDATE OR DELETE ON public.admin_grant_audit FOR EACH ROW EXECUTE FUNCTION public.admin_grant_audit_immutable();

-- Step 1 (trusted operator / project owner only).
CREATE OR REPLACE FUNCTION public.admin_grant_authorize(p_user_id BIGINT, p_email TEXT, p_approver TEXT, p_note TEXT DEFAULT '')
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE u RECORD; rid BIGINT;
BEGIN
  SELECT id, email INTO u FROM public.users WHERE id = p_user_id AND email = p_email FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No exact user ID/email match; nothing authorized.'; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_accounts WHERE user_id = p_user_id) THEN RAISE EXCEPTION 'User is already an administrator.'; END IF;
  UPDATE public.admin_grant_requests SET canceled_at = CURRENT_TIMESTAMP, cancel_reason = 'superseded'
    WHERE user_id = p_user_id AND granted_at IS NULL AND canceled_at IS NULL;
  INSERT INTO public.admin_grant_requests (user_id, email, owner_approver, owner_note) VALUES (p_user_id, p_email, btrim(p_approver), COALESCE(p_note, ''))
    RETURNING id INTO rid;
  INSERT INTO public.admin_grant_audit (request_id, user_id, email, event, actor, detail)
    VALUES (rid, p_user_id, p_email, 'authorized', btrim(p_approver), jsonb_build_object('db_user', current_user, 'note', COALESCE(p_note, ''), 'expires_at', CURRENT_TIMESTAMP + INTERVAL '24 hours'));
  RETURN rid;
END $$;

-- Step 2 (application, for the signed-in target account only). Returns 'ok' or a refusal reason.
CREATE OR REPLACE FUNCTION public.admin_grant_set_code(p_request_id BIGINT, p_user_id BIGINT, p_code_hash TEXT, p_client TEXT DEFAULT '')
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE r RECORD; cur_email TEXT;
BEGIN
  SELECT * INTO r FROM public.admin_grant_requests WHERE id = p_request_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR r.granted_at IS NOT NULL OR r.canceled_at IS NOT NULL THEN RETURN 'not_found'; END IF;
  IF r.expires_at < CURRENT_TIMESTAMP THEN
    UPDATE public.admin_grant_requests SET canceled_at = CURRENT_TIMESTAMP, cancel_reason = 'expired' WHERE id = r.id;
    INSERT INTO public.admin_grant_audit (request_id, user_id, email, event, actor) VALUES (r.id, r.user_id, r.email, 'expired', 'system');
    RETURN 'expired';
  END IF;
  SELECT email INTO cur_email FROM public.users WHERE id = p_user_id;
  IF cur_email IS DISTINCT FROM r.email THEN RETURN 'email_changed'; END IF;
  IF r.codes_sent >= 5 THEN RETURN 'too_many_codes'; END IF;
  IF r.last_code_sent_at IS NOT NULL AND r.last_code_sent_at > CURRENT_TIMESTAMP - INTERVAL '60 seconds' THEN RETURN 'wait'; END IF;
  IF p_code_hash !~ '^[a-f0-9]{64}$' THEN RETURN 'bad_hash'; END IF;
  UPDATE public.admin_grant_requests SET code_hash = p_code_hash, code_expires_at = CURRENT_TIMESTAMP + INTERVAL '15 minutes',
    codes_sent = codes_sent + 1, last_code_sent_at = CURRENT_TIMESTAMP WHERE id = r.id;
  INSERT INTO public.admin_grant_audit (request_id, user_id, email, event, actor, detail) VALUES (r.id, r.user_id, r.email, 'code_sent', 'user:' || p_user_id, jsonb_build_object('client', left(COALESCE(p_client, ''), 64)));
  RETURN 'ok';
END $$;

-- Step 3 (application). The only path in this workflow that writes admin_accounts.
CREATE OR REPLACE FUNCTION public.admin_grant_verify(p_request_id BIGINT, p_user_id BIGINT, p_code_hash TEXT, p_client TEXT DEFAULT '')
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE r RECORD; cur_email TEXT;
BEGIN
  SELECT * INTO r FROM public.admin_grant_requests WHERE id = p_request_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR r.granted_at IS NOT NULL OR r.canceled_at IS NOT NULL THEN RETURN 'not_found'; END IF;
  IF r.expires_at < CURRENT_TIMESTAMP THEN
    UPDATE public.admin_grant_requests SET canceled_at = CURRENT_TIMESTAMP, cancel_reason = 'expired' WHERE id = r.id;
    INSERT INTO public.admin_grant_audit (request_id, user_id, email, event, actor) VALUES (r.id, r.user_id, r.email, 'expired', 'system');
    RETURN 'expired';
  END IF;
  SELECT email INTO cur_email FROM public.users WHERE id = p_user_id;
  IF cur_email IS DISTINCT FROM r.email THEN RETURN 'email_changed'; END IF;
  IF r.code_hash IS NULL OR r.code_expires_at < CURRENT_TIMESTAMP THEN RETURN 'code_expired'; END IF;
  IF r.code_hash IS DISTINCT FROM p_code_hash THEN
    UPDATE public.admin_grant_requests SET failed_attempts = failed_attempts + 1,
      canceled_at = CASE WHEN failed_attempts + 1 >= 5 THEN CURRENT_TIMESTAMP END,
      cancel_reason = CASE WHEN failed_attempts + 1 >= 5 THEN 'too_many_attempts' END WHERE id = r.id;
    INSERT INTO public.admin_grant_audit (request_id, user_id, email, event, actor, detail)
      VALUES (r.id, r.user_id, r.email, CASE WHEN r.failed_attempts + 1 >= 5 THEN 'locked' ELSE 'code_rejected' END, 'user:' || p_user_id, jsonb_build_object('attempt', r.failed_attempts + 1, 'client', left(COALESCE(p_client, ''), 64)));
    RETURN CASE WHEN r.failed_attempts + 1 >= 5 THEN 'locked' ELSE 'wrong_code' END;
  END IF;
  INSERT INTO public.admin_accounts (user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.admin_grant_requests SET email_verified_at = CURRENT_TIMESTAMP, granted_at = CURRENT_TIMESTAMP, code_hash = NULL WHERE id = r.id;
  DELETE FROM public.sessions WHERE user_id = p_user_id;   -- same as the existing provisioning script: sign in again
  INSERT INTO public.admin_grant_audit (request_id, user_id, email, event, actor, detail)
    VALUES (r.id, r.user_id, r.email, 'verified_and_granted', 'user:' || p_user_id, jsonb_build_object('owner_approver', r.owner_approver, 'authorized_at', r.authorized_at, 'client', left(COALESCE(p_client, ''), 64)));
  RETURN 'granted';
END $$;

CREATE OR REPLACE FUNCTION public.admin_grant_cancel(p_request_id BIGINT, p_actor TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE r RECORD;
BEGIN
  UPDATE public.admin_grant_requests SET canceled_at = CURRENT_TIMESTAMP, cancel_reason = 'canceled'
    WHERE id = p_request_id AND granted_at IS NULL AND canceled_at IS NULL RETURNING * INTO r;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  INSERT INTO public.admin_grant_audit (request_id, user_id, email, event, actor) VALUES (r.id, r.user_id, r.email, 'canceled', btrim(p_actor));
  RETURN 'canceled';
END $$;

ALTER TABLE public.admin_grant_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_grant_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_grant_requests, public.admin_grant_audit FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_grant_authorize(BIGINT, TEXT, TEXT, TEXT), public.admin_grant_set_code(BIGINT, BIGINT, TEXT, TEXT),
  public.admin_grant_verify(BIGINT, BIGINT, TEXT, TEXT), public.admin_grant_cancel(BIGINT, TEXT) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.admin_grant_requests, public.admin_grant_audit FROM anon;
    REVOKE ALL ON FUNCTION public.admin_grant_authorize(BIGINT, TEXT, TEXT, TEXT), public.admin_grant_set_code(BIGINT, BIGINT, TEXT, TEXT),
      public.admin_grant_verify(BIGINT, BIGINT, TEXT, TEXT), public.admin_grant_cancel(BIGINT, TEXT) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.admin_grant_requests, public.admin_grant_audit FROM authenticated;
    REVOKE ALL ON FUNCTION public.admin_grant_authorize(BIGINT, TEXT, TEXT, TEXT), public.admin_grant_set_code(BIGINT, BIGINT, TEXT, TEXT),
      public.admin_grant_verify(BIGINT, BIGINT, TEXT, TEXT), public.admin_grant_cancel(BIGINT, TEXT) FROM authenticated;
  END IF;
END $$;
