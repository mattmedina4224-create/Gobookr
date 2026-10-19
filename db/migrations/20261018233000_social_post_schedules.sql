CREATE TABLE IF NOT EXISTS public.social_post_schedules (
  id BIGSERIAL PRIMARY KEY,
  pro_id BIGINT NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  destination TEXT NOT NULL CHECK (destination IN ('instagram_story')),
  weekdays TEXT[] NOT NULL,
  local_time TIME NOT NULL,
  timezone TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (pro_id, destination),
  CHECK (cardinality(weekdays) BETWEEN 1 AND 7),
  CHECK (weekdays <@ ARRAY['sun','mon','tue','wed','thu','fri','sat']::TEXT[])
);

CREATE INDEX IF NOT EXISTS idx_social_post_schedules_due
  ON public.social_post_schedules(enabled, destination, timezone, local_time);

COMMENT ON TABLE public.social_post_schedules IS
  'Professional-owned social publishing preferences. A schedule never implies provider publishing permission; workers must verify an active eligible connection before posting.';
