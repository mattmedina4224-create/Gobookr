ALTER TABLE public.pro_profiles
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS professional_handle TEXT,
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;

COMMENT ON COLUMN public.pro_profiles.display_name IS 'Customer-facing professional name; falls back to business_name when unset.';
COMMENT ON COLUMN public.pro_profiles.professional_handle IS 'Optional professional brand or social-style handle.';
COMMENT ON COLUMN public.pro_profiles.profile_photo_url IS 'Public profile image URL. Uploads are server-controlled and stored in the public portfolio bucket under profile-photos/.';
