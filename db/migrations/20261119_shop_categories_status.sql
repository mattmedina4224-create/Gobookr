-- Business-first directory: let shops be found by service category and record provenance.
--
-- Forward-safe and rerunnable. Adds one table and NULLable/defaulted columns; no existing shop,
-- owner, claim or address value is changed.
--   * shop_categories mirrors pro_categories: one row per (shop, Golden List category), so a
--     multi-service business is one page in several categories, never several pages.
--   * operational_status records what the evidence supports: 'verified' (a current public source
--     such as an active state registration or official site), 'uncertain', or 'closed'. Closed shops
--     stay in the table for review and are hidden from search; nothing is deleted automatically.
--   * license_number / source_external_id are optional stable keys (DORA registration number,
--     OpenStreetMap element) used to keep weekly imports idempotent.
--
-- Rollback (removes only these additions):
--   DROP TABLE IF EXISTS shop_categories;
--   DROP INDEX IF EXISTS idx_shops_license_number; DROP INDEX IF EXISTS idx_shops_source_external_id;
--   ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_operational_status_check;
--   ALTER TABLE shops DROP COLUMN IF EXISTS operational_status, DROP COLUMN IF EXISTS license_number,
--     DROP COLUMN IF EXISTS source_external_id;

CREATE TABLE IF NOT EXISTS shop_categories (
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (shop_id, category)
);
CREATE INDEX IF NOT EXISTS idx_shop_categories_category ON shop_categories (category, shop_id);

ALTER TABLE shops ADD COLUMN IF NOT EXISTS operational_status TEXT NOT NULL DEFAULT 'uncertain';
ALTER TABLE shops ADD COLUMN IF NOT EXISTS license_number TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS source_external_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_operational_status_check') THEN
    ALTER TABLE shops ADD CONSTRAINT shops_operational_status_check
      CHECK (operational_status IN ('verified','uncertain','closed')) NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_license_number ON shops (license_number) WHERE license_number IS NOT NULL AND license_number <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_source_external_id ON shops (source_external_id) WHERE source_external_id IS NOT NULL AND source_external_id <> '';
