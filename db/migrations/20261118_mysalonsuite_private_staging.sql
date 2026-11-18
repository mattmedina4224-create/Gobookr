-- MY SALON Suite first-party member sitemap inventory.
-- Private staging: source URLs only are verified. No fabricated categories, cities or booking URLs.
-- Applied to production on 2026-11-18 (10,930 source rows).
CREATE SCHEMA IF NOT EXISTS import_staging;
REVOKE ALL ON SCHEMA import_staging FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA import_staging TO service_role;

CREATE TABLE IF NOT EXISTS import_staging.mysalon_suite_members (
  source_url text PRIMARY KEY,
  source_slug text NOT NULL,
  source_name text NOT NULL DEFAULT 'MY SALON Suite',
  name_hint_unverified text,
  professional_name text,
  workplace_name text,
  city text,
  state text,
  street_address text,
  zip_code text,
  category text,
  booking_url text,
  identity_verified boolean NOT NULL DEFAULT false,
  category_verified boolean NOT NULL DEFAULT false,
  location_verified boolean NOT NULL DEFAULT false,
  booking_verified boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'awaiting_member_profile_verification',
  source_checked_at timestamptz,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  imported_pro_id bigint,
  CONSTRAINT mysalon_member_official_source CHECK
    (source_url ~ '^https://www[.]mysalonsuite[.]com/members/[A-Za-z0-9-]+/$'),
  CONSTRAINT mysalon_member_stage_state CHECK
    (verification_status IN ('awaiting_member_profile_verification',
      'details_verified', 'ready_to_import', 'imported', 'rejected')),
  CONSTRAINT mysalon_member_imported_id CHECK
    (imported_pro_id IS NULL OR verification_status = 'imported')
);

ALTER TABLE import_staging.mysalon_suite_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON import_staging.mysalon_suite_members FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON import_staging.mysalon_suite_members TO service_role;

-- Deliberately NO authenticated or anonymous RLS policies.
-- Member records are not public GoBookr profiles until their actual specialty,
-- location and booking URL have been verified independently.
