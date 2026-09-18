-- Track outbound booking leads without exposing provider URLs in public profile markup.
CREATE TABLE IF NOT EXISTS booking_clicks (
  id BIGSERIAL PRIMARY KEY,
  pro_id BIGINT NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
  customer_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_booking_clicks_pro_created ON booking_clicks (pro_id, created_at);
