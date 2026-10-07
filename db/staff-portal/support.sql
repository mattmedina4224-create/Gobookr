-- Isolated preview first. No mailbox credentials or message ingestion endpoint.
ALTER TABLE staff_ops.members DROP CONSTRAINT IF EXISTS members_permissions_check;
ALTER TABLE staff_ops.members ADD CONSTRAINT members_permissions_check CHECK(permissions <@ ARRAY['claims.read','claims.review','licenses.read','licenses.review','inventory.read','inventory.review','support.read','support.reply']::TEXT[]);
CREATE TABLE IF NOT EXISTS staff_ops.support_tickets (
 id BIGSERIAL PRIMARY KEY,
 owner_id BIGINT NOT NULL REFERENCES staff_ops.owners(user_id),
 provider_thread_key TEXT NOT NULL CHECK(length(provider_thread_key) BETWEEN 1 AND 512),
 subject TEXT NOT NULL CHECK(length(subject)<=200),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 assignee_id BIGINT REFERENCES staff_ops.members(id),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(owner_id,provider_thread_key)
);
CREATE INDEX IF NOT EXISTS support_owner_queue ON staff_ops.support_tickets(owner_id,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS support_assignee_queue ON staff_ops.support_tickets(assignee_id,updated_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS staff_ops.support_messages (
 id BIGSERIAL PRIMARY KEY,
 ticket_id BIGINT NOT NULL REFERENCES staff_ops.support_tickets(id),
 provider_message_key TEXT NOT NULL UNIQUE CHECK(length(provider_message_key) BETWEEN 1 AND 512),
 sender TEXT NOT NULL CHECK(length(sender)<=254),
 body_text TEXT NOT NULL CHECK(length(body_text)<=30000),
 received_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS support_thread_messages ON staff_ops.support_messages(ticket_id,id);
CREATE TABLE IF NOT EXISTS staff_ops.support_reads (
 ticket_id BIGINT NOT NULL REFERENCES staff_ops.support_tickets(id),
 user_id BIGINT NOT NULL REFERENCES public.users(id),
 last_message_id BIGINT NOT NULL DEFAULT 0 CHECK(last_message_id>=0),
 read_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(ticket_id,user_id)
);
CREATE TABLE IF NOT EXISTS staff_ops.support_drafts (
 ticket_id BIGINT NOT NULL REFERENCES staff_ops.support_tickets(id),
 user_id BIGINT NOT NULL REFERENCES public.users(id),
 body_text TEXT NOT NULL CHECK(length(body_text) BETWEEN 1 AND 10000),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(ticket_id,user_id)
);
CREATE TABLE IF NOT EXISTS staff_ops.support_events (
 id BIGSERIAL PRIMARY KEY,
 ticket_id BIGINT NOT NULL REFERENCES staff_ops.support_tickets(id),
 actor_id BIGINT NOT NULL REFERENCES public.users(id),
 action TEXT NOT NULL CHECK(action IN ('read','assigned','status_updated','draft_saved')),
 ticket_version INTEGER NOT NULL,
 details JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS support_ticket_events ON staff_ops.support_events(ticket_id,id DESC);
ALTER TABLE staff_ops.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_ops.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_ops.support_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_ops.support_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_ops.support_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA staff_ops FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA staff_ops FROM PUBLIC,anon,authenticated;
