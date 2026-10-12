-- Private server-side OAuth state and encrypted Meta credentials.
CREATE TABLE IF NOT EXISTS public.meta_oauth_states (
  state_hash TEXT PRIMARY KEY CHECK (char_length(state_hash)=64),
  pro_id BIGINT NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meta_states_pro ON public.meta_oauth_states(pro_id);
CREATE INDEX IF NOT EXISTS idx_meta_states_user ON public.meta_oauth_states(user_id);
CREATE INDEX IF NOT EXISTS idx_meta_states_expiry ON public.meta_oauth_states(expires_at);
CREATE TABLE IF NOT EXISTS public.meta_connection_choices (
  pro_id BIGINT PRIMARY KEY REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL,
  encrypted_choices TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meta_choices_user ON public.meta_connection_choices(user_id);
CREATE INDEX IF NOT EXISTS idx_meta_choices_expiry ON public.meta_connection_choices(expires_at);
CREATE TABLE IF NOT EXISTS public.meta_connections (
  pro_id BIGINT PRIMARY KEY REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_name TEXT NOT NULL,
  instagram_id TEXT,
  encrypted_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_meta_connections_user ON public.meta_connections(user_id);
ALTER TABLE public.meta_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_connection_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meta_oauth_states,public.meta_connection_choices,public.meta_connections FROM PUBLIC,anon,authenticated,service_role;
