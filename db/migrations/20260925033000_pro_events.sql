-- GoBookr professional analytics foundation
CREATE TABLE IF NOT EXISTS public.pro_events (
  id BIGSERIAL PRIMARY KEY,
  pro_id BIGINT NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('profile_view', 'booking_click')),
  actor_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pro_events_pro_created ON public.pro_events (pro_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pro_events_type_created ON public.pro_events (event_type, created_at DESC);
ALTER TABLE public.pro_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pro_events FROM PUBLIC;
