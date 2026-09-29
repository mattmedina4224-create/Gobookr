-- Index the coordinate pair used by marketplace bounding-box searches.
CREATE INDEX IF NOT EXISTS idx_pro_profiles_coordinates
  ON pro_profiles (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
