-- Career Studio (free résumés for professionals) + GoBookr Business Pro (paid hiring tools for businesses).
-- Forward-safe: new tables only. Nothing existing is altered. Business Pro billing lives in its own table and never
-- touches subscriptions (professional $20/month), shop_subscriptions (legacy) or business_team_plans (sponsored seats).
--
-- Rollback:
--   DROP TABLE IF EXISTS hiring_notifications, application_messages, job_applications, job_posts, pro_resumes,
--     business_pro_events, business_pro_subscriptions;

CREATE TABLE IF NOT EXISTS business_pro_subscriptions (
  shop_id BIGINT PRIMARY KEY REFERENCES shops(id) ON DELETE CASCADE,
  owner_user_id BIGINT NOT NULL,               -- the owner who started billing; entitlement requires this to still own the shop
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  stripe_checkout_session_id TEXT,
  checkout_key TEXT,                            -- idempotency key of the open checkout attempt
  status TEXT NOT NULL DEFAULT 'none' CHECK (status IN ('none', 'checkout', 'incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'incomplete_expired', 'paused')),
  livemode BOOLEAN NOT NULL DEFAULT FALSE,
  price_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'usd',
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  past_due_since TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_business_pro_customer ON business_pro_subscriptions (stripe_customer_id);

CREATE TABLE IF NOT EXISTS business_pro_events (
  event_id TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A professional's résumé belongs to their permanent profile, not to any workplace. Private: it is only shared, as a
-- snapshot, with a business the professional applies to.
CREATE TABLE IF NOT EXISTS pro_resumes (
  pro_id BIGINT PRIMARY KEY REFERENCES pro_profiles(id) ON DELETE CASCADE,
  headline TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  years_experience INTEGER CHECK (years_experience IS NULL OR years_experience BETWEEN 0 AND 60),
  specialties JSONB NOT NULL DEFAULT '[]'::jsonb,
  licenses JSONB NOT NULL DEFAULT '[]'::jsonb,       -- self-reported; shown with that label
  experience JSONB NOT NULL DEFAULT '[]'::jsonb,
  education JSONB NOT NULL DEFAULT '[]'::jsonb,
  work_types JSONB NOT NULL DEFAULT '[]'::jsonb,     -- employee, commission, booth_rent, suite_rental, apprentice, part_time
  preferred_cities TEXT NOT NULL DEFAULT '',
  open_to_work BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_posts (
  id BIGSERIAL PRIMARY KEY,
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  work_type TEXT NOT NULL DEFAULT 'employee',
  compensation TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  requirements TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  published_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_by_user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_job_posts_shop ON job_posts (shop_id, status, id DESC);
CREATE INDEX IF NOT EXISTS idx_job_posts_open ON job_posts (published_at DESC) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS job_applications (
  id BIGSERIAL PRIMARY KEY,
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  job_post_id BIGINT REFERENCES job_posts(id) ON DELETE SET NULL,
  pro_id BIGINT NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
  applicant_user_id BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'interview', 'offer', 'hired', 'declined', 'withdrawn')),
  resume_snapshot JSONB NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  business_unread BOOLEAN NOT NULL DEFAULT TRUE,
  pro_unread BOOLEAN NOT NULL DEFAULT FALSE,
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- One live application per professional per opening (or per business for general applications).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_job_application_open ON job_applications (pro_id, shop_id, COALESCE(job_post_id, 0)) WHERE status <> 'withdrawn';
CREATE INDEX IF NOT EXISTS idx_job_applications_shop ON job_applications (shop_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_applications_pro ON job_applications (pro_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS application_messages (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('business', 'pro')),
  sender_user_id BIGINT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_application_messages_app ON application_messages (application_id, id);

CREATE TABLE IF NOT EXISTS hiring_notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  application_id BIGINT REFERENCES job_applications(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hiring_notifications_user ON hiring_notifications (user_id, read_at, id DESC);

ALTER TABLE business_pro_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_pro_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pro_resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE hiring_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON business_pro_subscriptions, business_pro_events, pro_resumes, job_posts, job_applications, application_messages, hiring_notifications FROM anon, authenticated;
