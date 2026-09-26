-- GoBookr uses server-side sessions with BIGINT public.users IDs, not
-- Supabase Auth UUIDs. Only the trusted backend connection may access this table.
BEGIN;
CREATE TABLE public.customer_favorites (
  customer_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  pro_id BIGINT NOT NULL REFERENCES public.pro_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (customer_id, pro_id)
);
CREATE INDEX idx_customer_favorites_pro ON public.customer_favorites (pro_id);
CREATE INDEX idx_customer_favorites_customer_created ON public.customer_favorites (customer_id, created_at DESC, pro_id DESC);
ALTER TABLE public.customer_favorites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_favorites FROM PUBLIC, anon, authenticated;
-- Deliberately no client policies or public aggregate RPC: session-authorized
-- server routes enforce customer ownership and return only a pro's own count.
COMMENT ON TABLE public.customer_favorites IS 'Private customer saves; independent of any future Follow relationship.';
COMMIT;
