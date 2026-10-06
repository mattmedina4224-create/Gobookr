-- Additive, private work queue. Install in isolated preview only first.
CREATE UNIQUE INDEX IF NOT EXISTS staff_members_owner_pair ON staff_ops.members(id,owner_id);
CREATE TABLE IF NOT EXISTS staff_ops.work_items (
  id BIGSERIAL PRIMARY KEY,
  owner_id BIGINT NOT NULL REFERENCES staff_ops.owners(user_id),
  member_id BIGINT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  instructions TEXT NOT NULL DEFAULT '' CHECK(length(instructions)<=2000),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','blocked','done')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(member_id,owner_id) REFERENCES staff_ops.members(id,owner_id)
);
CREATE INDEX IF NOT EXISTS staff_work_owner ON staff_ops.work_items(owner_id,id DESC);
CREATE INDEX IF NOT EXISTS staff_work_member ON staff_ops.work_items(member_id,id DESC);
CREATE TABLE IF NOT EXISTS staff_ops.work_events (
  id BIGSERIAL PRIMARY KEY,
  work_id BIGINT NOT NULL REFERENCES staff_ops.work_items(id),
  actor_id BIGINT NOT NULL REFERENCES public.users(id),
  status TEXT NOT NULL CHECK(status IN ('not_started','in_progress','blocked','done')),
  note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=1500),
  version INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS staff_work_events_item ON staff_ops.work_events(work_id,id DESC);
ALTER TABLE staff_ops.work_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_ops.work_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON staff_ops.work_items,staff_ops.work_events FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE staff_ops.work_items_id_seq,staff_ops.work_events_id_seq FROM PUBLIC,anon,authenticated;
