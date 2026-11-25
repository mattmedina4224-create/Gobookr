-- First-party business page analytics: public page views and "Book" link clicks for each shop.
-- Stores no visitor identity (no user id, IP or user agent). Owners' own visits and obvious crawlers are not recorded.
-- Additive and idempotent. Rollback: DROP TABLE IF EXISTS public.shop_events;

CREATE TABLE IF NOT EXISTS public.shop_events (
  id BIGSERIAL PRIMARY KEY,
  shop_id BIGINT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('profile_view', 'booking_click')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shop_events_shop_type_time ON public.shop_events (shop_id, event_type, created_at DESC);

ALTER TABLE public.shop_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.shop_events FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE public.shop_events FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE public.shop_events FROM authenticated; END IF;
END $$;
