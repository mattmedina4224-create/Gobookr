-- Preserve the visual design and manually entered availability for reusable campaigns.
ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS story_style TEXT NOT NULL DEFAULT 'classic'
  CHECK (story_style IN ('classic', 'clean', 'bold'));

ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS available_slots JSONB NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(available_slots) = 'array');

COMMENT ON COLUMN public.marketing_campaigns.story_style IS
  'Reusable Story design selected by the professional.';
COMMENT ON COLUMN public.marketing_campaigns.available_slots IS
  'Professional-entered availability snapshots for update-and-repost campaigns; not verified booking availability.';
