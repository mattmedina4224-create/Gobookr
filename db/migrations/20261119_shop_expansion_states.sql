-- National shop expansion dashboard: one row per state with the latest discovery run, coverage audit and
-- rollout status. Published/website/claimed counts are NOT stored here; the dashboard reads them live from
-- shops so they cannot drift. Forward-safe: new table only.
-- Rollback: DROP TABLE IF EXISTS shop_expansion_states;
CREATE TABLE IF NOT EXISTS shop_expansion_states (
  state TEXT PRIMARY KEY CHECK (state ~ '^[A-Z]{2}$'),
  wave INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'discovery' CHECK (status IN ('discovery', 'importing', 'verification', 'live', 'maintenance')),
  sources_discovered INTEGER NOT NULL DEFAULT 0,
  sources_processed INTEGER NOT NULL DEFAULT 0,
  candidates INTEGER NOT NULL DEFAULT 0,
  verified_unique INTEGER NOT NULL DEFAULT 0,
  held_for_review INTEGER NOT NULL DEFAULT 0,
  duplicates_skipped INTEGER NOT NULL DEFAULT 0,
  census_places INTEGER NOT NULL DEFAULT 0,
  places_covered INTEGER NOT NULL DEFAULT 0,
  census_counties INTEGER NOT NULL DEFAULT 0,
  counties_covered INTEGER NOT NULL DEFAULT 0,
  review_reasons JSONB NOT NULL DEFAULT '{}'::jsonb,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  importer_errors TEXT NOT NULL DEFAULT '',
  coverage_gaps TEXT NOT NULL DEFAULT '',
  last_discovery_run_at TIMESTAMPTZ,
  last_discovery_run_id TEXT NOT NULL DEFAULT '',
  last_import_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  verification_notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shops_state_city ON shops (UPPER(state), lower(city));
-- Admin-only data: no access through the Supabase public API roles.
ALTER TABLE shop_expansion_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON shop_expansion_states FROM PUBLIC, anon, authenticated;
