-- Additive only: no existing profile, license flag or ownership is changed.
-- Public registry facts only; never store private documents or reviewer notes.
ALTER TABLE public.pro_profiles ADD COLUMN IF NOT EXISTS license_verification JSONB;
