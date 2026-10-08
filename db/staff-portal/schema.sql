-- Manual installation in an isolated preview database first. Not auto-migrated.
-- No owner is inferred from an email, account role, or business ownership.
CREATE SCHEMA IF NOT EXISTS staff_ops;
REVOKE ALL ON SCHEMA staff_ops FROM PUBLIC;
CREATE TABLE IF NOT EXISTS staff_ops.owners (
  user_id BIGINT PRIMARY KEY REFERENCES public.users(id),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS staff_ops.members (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES public.users(id),
  owner_id BIGINT NOT NULL REFERENCES staff_ops.owners(user_id),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  phone TEXT NOT NULL DEFAULT '' CHECK(length(phone)<=40),
  job_title TEXT NOT NULL DEFAULT '' CHECK(length(job_title)<=100),
  department TEXT NOT NULL DEFAULT '' CHECK(length(department)<=100),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  permissions TEXT[] NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(user_id<>owner_id),
  CHECK(permissions <@ ARRAY['claims.read','claims.review','licenses.read','licenses.review','inventory.read','inventory.review']::TEXT[])
);
CREATE INDEX IF NOT EXISTS staff_members_owner ON staff_ops.members(owner_id,id);
CREATE TABLE IF NOT EXISTS staff_ops.audit (
  id BIGSERIAL PRIMARY KEY,
  actor_id BIGINT NOT NULL REFERENCES public.users(id),
  member_id BIGINT NOT NULL REFERENCES staff_ops.members(id),
  action TEXT NOT NULL CHECK(action IN ('added','personal_updated','job_updated','access_updated')),
  version INTEGER NOT NULL,
  permissions TEXT[] NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE staff_ops.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_ops.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_ops.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA staff_ops FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA staff_ops FROM PUBLIC;
-- No client grants, owner provisioning, payroll data, or SECURITY DEFINER functions.
