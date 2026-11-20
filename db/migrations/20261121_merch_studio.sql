-- GoBookr Merch Studio: saved designs, orders, per-supplier orders, timeline events and webhook de-duplication.
-- Forward-safe: new tables only; nothing existing is altered.
-- Designs and orders are owned by a professional (pro_profiles.id) or a business (shops.id). A professional's
-- design is keyed to their permanent profile, never to a workplace, so it stays with them if they change employers.
-- Rollback: DROP TABLE IF EXISTS merch_webhook_events, merch_order_events, merch_supplier_orders, merch_order_items, merch_orders, merch_designs;

CREATE TABLE IF NOT EXISTS merch_designs (
  id BIGSERIAL PRIMARY KEY,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('pro', 'shop')),
  owner_id BIGINT NOT NULL,
  created_by_user_id BIGINT,
  product TEXT NOT NULL,
  supplier TEXT NOT NULL,
  size TEXT,
  name TEXT NOT NULL DEFAULT 'Untitled design',
  front JSONB NOT NULL DEFAULT '{}'::jsonb,
  back JSONB NOT NULL DEFAULT '{}'::jsonb,
  files JSONB NOT NULL DEFAULT '[]'::jsonb,
  preflight JSONB NOT NULL DEFAULT '{}'::jsonb,
  print_files_ok BOOLEAN NOT NULL DEFAULT FALSE,
  qr_target TEXT,
  qr_verified_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (qr_target IS NULL OR qr_target ~ '^https://gobookr\.com/(pro|shop)/[0-9]+$')
);
CREATE INDEX IF NOT EXISTS idx_merch_designs_owner ON merch_designs (owner_kind, owner_id, updated_at DESC) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS merch_orders (
  id BIGSERIAL PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  buyer_user_id BIGINT,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('pro', 'shop')),
  owner_id BIGINT NOT NULL,
  business_name TEXT NOT NULL DEFAULT '',
  ship_to JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'quoted', 'awaiting_payment', 'paid', 'in_production', 'partially_shipped', 'shipped', 'delivered', 'needs_attention', 'refunded', 'partially_refunded', 'canceled')),
  currency TEXT NOT NULL DEFAULT 'usd',
  mode TEXT NOT NULL DEFAULT 'simulated' CHECK (mode IN ('simulated', 'test', 'live', 'blocked')),
  simulated BOOLEAN NOT NULL DEFAULT TRUE,
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  quote JSONB,
  quote_expires_at TIMESTAMPTZ,
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  paid_at TIMESTAMPTZ,
  attention TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_merch_orders_owner ON merch_orders (owner_kind, owner_id, id DESC);

CREATE TABLE IF NOT EXISTS merch_order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES merch_orders(id) ON DELETE CASCADE,
  line_key TEXT NOT NULL,
  product TEXT NOT NULL,
  supplier TEXT NOT NULL,
  size TEXT, color TEXT, sides TEXT, finish TEXT,
  pack INTEGER NOT NULL DEFAULT 1 CHECK (pack > 0),
  units INTEGER NOT NULL CHECK (units > 0),
  pieces INTEGER NOT NULL CHECK (pieces > 0),
  label TEXT NOT NULL DEFAULT '',
  design_id BIGINT REFERENCES merch_designs(id),
  files JSONB NOT NULL DEFAULT '[]'::jsonb,
  unit_cents INTEGER NOT NULL DEFAULT 0,
  line_cents INTEGER NOT NULL DEFAULT 0,
  UNIQUE (order_id, line_key)
);

CREATE TABLE IF NOT EXISTS merch_supplier_orders (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES merch_orders(id) ON DELETE CASCADE,
  supplier TEXT NOT NULL,
  external_id TEXT NOT NULL UNIQUE,
  supplier_order_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'acknowledged', 'in_production', 'shipped', 'delivered', 'failed')),
  simulated BOOLEAN NOT NULL DEFAULT FALSE,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  shipments JSONB NOT NULL DEFAULT '[]'::jsonb,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  refund_id TEXT,
  submitted_at TIMESTAMPTZ, acknowledged_at TIMESTAMPTZ, shipped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (order_id, supplier)
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_merch_supplier_order_ref ON merch_supplier_orders (supplier, supplier_order_id) WHERE supplier_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS merch_order_events (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES merch_orders(id) ON DELETE CASCADE,
  step TEXT NOT NULL,
  message TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_merch_order_events_order ON merch_order_events (order_id, id);

CREATE TABLE IF NOT EXISTS merch_webhook_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, event_id)
);

ALTER TABLE merch_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE merch_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE merch_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE merch_supplier_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE merch_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE merch_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON merch_designs, merch_orders, merch_order_items, merch_supplier_orders, merch_order_events, merch_webhook_events FROM anon, authenticated;
