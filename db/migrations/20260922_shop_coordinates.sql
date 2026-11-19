-- Shop coordinates for radius ("near me") business search.
--
-- Forward-safe and rerunnable:
--   * Adds two NULLable columns; no existing row, address or claim state is touched.
--   * No coordinates are written here. Shops keep NULL until a real geocode of their
--     verified address is stored; never fill these with guessed or city-centre values.
--   * Range checks are added NOT VALID (no table rewrite) and only guard new writes.
--   * The partial index mirrors idx_pro_profiles_coordinates and only covers shops
--     that actually have coordinates.
--
-- Rollback (only if needed; drops nothing but these additions):
--   DROP INDEX IF EXISTS idx_shops_coordinates;
--   ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_latitude_range;
--   ALTER TABLE shops DROP CONSTRAINT IF EXISTS shops_longitude_range;
--   ALTER TABLE shops DROP COLUMN IF EXISTS latitude;
--   ALTER TABLE shops DROP COLUMN IF EXISTS longitude;

ALTER TABLE shops ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_latitude_range') THEN
    ALTER TABLE shops ADD CONSTRAINT shops_latitude_range
      CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'shops_longitude_range') THEN
    ALTER TABLE shops ADD CONSTRAINT shops_longitude_range
      CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shops_coordinates
  ON shops (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
