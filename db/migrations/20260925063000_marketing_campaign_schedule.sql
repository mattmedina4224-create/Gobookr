-- Upgrade databases that applied the original marketing_campaigns migration
-- before campaign scheduling fields were added to that migration file.
ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'scheduled', 'shared', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_schedule
  ON public.marketing_campaigns (pro_id, status, scheduled_for);
