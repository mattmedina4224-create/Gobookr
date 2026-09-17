-- GoBookr independent shop accounts.
-- Shops and individual professionals are separate marketplace listings.
-- A shop does not own, contain, manage, or control professional profiles.
-- Public-source shops may exist unclaimed until ownership is verified.

CREATE TABLE IF NOT EXISTS shops (
  id BIGSERIAL PRIMARY KEY,
  owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  street_address TEXT NOT NULL DEFAULT '',
  suite TEXT NOT NULL DEFAULT '',
  zip_code TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  website_url TEXT NOT NULL DEFAULT '',
  booking_url TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  claim_status TEXT NOT NULL DEFAULT 'unclaimed' CHECK (claim_status IN ('unclaimed','pending','claimed')),
  source_url TEXT,
  source_name TEXT,
  source_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shops_location ON shops (state, city, zip_code);
CREATE INDEX IF NOT EXISTS idx_shops_name_location ON shops (LOWER(name), LOWER(city), UPPER(state));
CREATE INDEX IF NOT EXISTS idx_shops_owner ON shops (owner_user_id);

CREATE TABLE IF NOT EXISTS shop_claims (
  id BIGSERIAL PRIMARY KEY,
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  claimant_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  verification_note TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMPTZ,
  UNIQUE (shop_id, claimant_user_id, status)
);

CREATE INDEX IF NOT EXISTS idx_shop_claims_shop_status ON shop_claims (shop_id, status);

-- Shop subscriptions are independent from individual professional subscriptions.
-- Billing uses the $35/month shop plan; provider price IDs stay in environment config.
CREATE TABLE IF NOT EXISTS shop_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  shop_id BIGINT NOT NULL UNIQUE REFERENCES shops(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  plan_code TEXT NOT NULL DEFAULT 'shop_monthly_35',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
