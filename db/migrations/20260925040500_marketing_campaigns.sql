CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id BIGSERIAL PRIMARY KEY,
  pro_id BIGINT NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
  campaign_type TEXT NOT NULL,
  copy TEXT NOT NULL,
  portfolio_item_id BIGINT REFERENCES public.portfolio_items(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_pro_created ON public.marketing_campaigns (pro_id, created_at DESC);
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketing_campaigns FROM PUBLIC;

ALTER TABLE public.marketing_campaigns ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;
ALTER TABLE public.marketing_campaigns ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'shared', 'cancelled'));
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_schedule ON public.marketing_campaigns (pro_id, status, scheduled_for);
