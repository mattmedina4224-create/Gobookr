-- Follow relationships remain private. Only GoBookr's server may access them;
-- app sessions use numeric users, not Supabase Auth identities.
CREATE TABLE IF NOT EXISTS public.customer_follows (
  customer_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  pro_id BIGINT NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (customer_id, pro_id)
);
CREATE INDEX IF NOT EXISTS idx_customer_follows_pro ON public.customer_follows(pro_id);

CREATE TABLE IF NOT EXISTS public.pro_updates (
  id BIGSERIAL PRIMARY KEY,
  pro_id BIGINT NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 1000),
  portfolio_item_id BIGINT REFERENCES public.portfolio_items(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pro_updates_pro_id ON public.pro_updates(pro_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_pro_updates_published ON public.pro_updates(id DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_pro_updates_photo ON public.pro_updates(portfolio_item_id) WHERE portfolio_item_id IS NOT NULL;
ALTER TABLE public.customer_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pro_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_follows, public.pro_updates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.pro_updates_id_seq FROM PUBLIC, anon, authenticated;
