-- One current challenge per professional. No raw codes or public access.
CREATE TABLE public.profile_email_confirmations (
  pro_id BIGINT PRIMARY KEY REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nonce TEXT NOT NULL,
  code_digest TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  window_started_at TIMESTAMPTZ NOT NULL,
  requests_in_window INTEGER NOT NULL DEFAULT 1 CHECK (requests_in_window BETWEEN 1 AND 5)
);
ALTER TABLE public.profile_email_confirmations ENABLE ROW LEVEL SECURITY;
CREATE INDEX profile_email_confirmations_user_id_idx ON public.profile_email_confirmations(user_id);
REVOKE ALL ON TABLE public.profile_email_confirmations FROM anon, authenticated;
COMMENT ON TABLE public.profile_email_confirmations IS 'Private account-email confirmation only. Does not verify licenses or ownership of imported profiles.';
