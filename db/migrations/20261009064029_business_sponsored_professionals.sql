CREATE TABLE public.business_team_members (
 id BIGSERIAL PRIMARY KEY,
 shop_id BIGINT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
 email TEXT NOT NULL CHECK(email=lower(trim(email)) AND length(email)<=254),
 pro_id BIGINT REFERENCES public.pro_profiles(id) ON DELETE SET NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','removed')),
 covered INTEGER NOT NULL DEFAULT 0 CHECK(covered IN (0,1)),
 invited_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 accepted_at TIMESTAMPTZ,
 expires_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP + INTERVAL '30 days',
 CHECK(status='accepted' OR covered=0)
);
CREATE UNIQUE INDEX business_team_open_email ON public.business_team_members(shop_id,email) WHERE status IN ('pending','accepted');
CREATE UNIQUE INDEX business_team_one_business ON public.business_team_members(pro_id) WHERE status='accepted';
CREATE INDEX business_team_inbox ON public.business_team_members(email,status);
CREATE INDEX business_team_shop ON public.business_team_members(shop_id,status);
CREATE TABLE public.business_team_plans (
 shop_id BIGINT PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'inactive',
 customer_id TEXT,
 subscription_id TEXT UNIQUE,
 quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity BETWEEN 0 AND 500),
 current_period_end TIMESTAMPTZ,
 trial_ends_at TIMESTAMPTZ,
 past_due_since TIMESTAMPTZ,
 cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
 checkout_id TEXT,
 checkout_url TEXT,
 checkout_expires_at TIMESTAMPTZ,
 checkout_members JSONB NOT NULL DEFAULT '[]',
 operation_key TEXT,
 operation_until TIMESTAMPTZ,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.business_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_team_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_team_members,public.business_team_plans FROM anon,authenticated;
REVOKE ALL ON SEQUENCE public.business_team_members_id_seq FROM anon,authenticated;
COMMENT ON TABLE public.business_team_members IS 'Consent-based business team; profile ownership stays with the professional. Access through authenticated server routes only.';

ALTER TABLE public.business_team_plans ADD COLUMN operation_payload JSONB, ADD COLUMN operation_started_at TIMESTAMPTZ, ADD COLUMN checkout_key TEXT;
ALTER TABLE public.subscriptions ADD COLUMN billing_owner TEXT NOT NULL DEFAULT 'personal' CHECK(billing_owner IN ('personal','business')),ADD COLUMN personal_checkout_until TIMESTAMPTZ;
