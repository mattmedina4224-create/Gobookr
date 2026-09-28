ALTER TABLE public.pro_profiles
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS professional_handle TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.pro_profiles.profile_photo_url IS 'Public professional headshot/avatar URL. Upload and changes are controlled by the GoBookr server.';
COMMENT ON COLUMN public.pro_profiles.professional_handle IS 'Optional professional brand or social-style handle used for identity and discovery.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-photos', 'profile-photos', true, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
