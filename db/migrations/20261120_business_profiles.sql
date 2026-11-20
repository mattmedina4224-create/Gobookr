-- Business profiles: owner-managed branding, hours, links, photos, services and FREE team affiliation.
-- Forward-safe: new nullable/defaulted columns and new tables only. Nothing here touches billing.
-- Importers never write these columns or tables, and they only ever update unclaimed shops.
--
-- Rollback:
--   DROP TABLE IF EXISTS shop_team_members, shop_services, shop_photos;
--   ALTER TABLE shops DROP COLUMN IF EXISTS tagline, DROP COLUMN IF EXISTS neighborhood, DROP COLUMN IF EXISTS cover_position,
--     DROP COLUMN IF EXISTS hours, DROP COLUMN IF EXISTS social_links, DROP COLUMN IF EXISTS specialties,
--     DROP COLUMN IF EXISTS amenities, DROP COLUMN IF EXISTS profile_published_at, DROP COLUMN IF EXISTS profile_updated_at;

ALTER TABLE shops ADD COLUMN IF NOT EXISTS tagline TEXT NOT NULL DEFAULT '';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS neighborhood TEXT NOT NULL DEFAULT '';
-- Vertical focal point of the cover photo, 0 (top) .. 100 (bottom).
ALTER TABLE shops ADD COLUMN IF NOT EXISTS cover_position INTEGER NOT NULL DEFAULT 50;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS hours JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS specialties JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS amenities JSONB NOT NULL DEFAULT '[]'::jsonb;
-- NULL until the owner publishes from setup; until then owner content is preview-only.
ALTER TABLE shops ADD COLUMN IF NOT EXISTS profile_published_at TIMESTAMPTZ;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMPTZ;
DO $$ BEGIN
  ALTER TABLE shops ADD CONSTRAINT shops_cover_position_range CHECK (cover_position BETWEEN 0 AND 100) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS shop_photos (
  id BIGSERIAL PRIMARY KEY,
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('interior', 'exterior', 'workstation', 'product', 'portfolio', 'other')),
  width INTEGER,
  height INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  uploaded_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shop_photos_shop ON shop_photos (shop_id, sort_order, id);

CREATE TABLE IF NOT EXISTS shop_services (
  id BIGSERIAL PRIMARY KEY,
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '',
  -- Prices and durations are only ever entered by the business. NULL = not listed.
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents BETWEEN 0 AND 10000000),
  price_type TEXT NOT NULL DEFAULT 'fixed' CHECK (price_type IN ('fixed', 'from')),
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 1440),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shop_services_shop ON shop_services (shop_id, sort_order, id);

-- Free team affiliation. Separate from business_team_members/business_team_plans (optional paid
-- sponsorship, still behind BUSINESS_TEAMS_ENABLED). Accepting never changes anyone's billing.
CREATE TABLE IF NOT EXISTS shop_team_members (
  id BIGSERIAL PRIMARY KEY,
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  pro_id BIGINT REFERENCES pro_profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'canceled', 'removed', 'left')),
  token_hash TEXT,
  invited_by BIGINT,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '14 days'),
  last_sent_at TIMESTAMPTZ,
  send_count INTEGER NOT NULL DEFAULT 0,
  accepted_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_shop_team_open_invite ON shop_team_members (shop_id, lower(email)) WHERE status IN ('pending', 'accepted');
CREATE UNIQUE INDEX IF NOT EXISTS uniq_shop_team_member_pro ON shop_team_members (shop_id, pro_id) WHERE status = 'accepted';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_shop_team_token ON shop_team_members (token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shop_team_shop ON shop_team_members (shop_id, status);
CREATE INDEX IF NOT EXISTS idx_shop_team_pro ON shop_team_members (pro_id) WHERE status = 'accepted';

-- Server-side access only (the app connects with the database role; nothing here is for the public API).
ALTER TABLE shop_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_team_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON shop_photos, shop_services, shop_team_members FROM PUBLIC, anon, authenticated;
