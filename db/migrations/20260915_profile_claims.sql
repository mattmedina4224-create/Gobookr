-- GoBookr unclaimed-profile ownership requests.
-- A public listing stays unclaimed until a claim is explicitly verified and approved.

CREATE TABLE IF NOT EXISTS profile_claims (
  id BIGSERIAL PRIMARY KEY,
  pro_id BIGINT NOT NULL REFERENCES pro_profiles(id) ON DELETE CASCADE,
  claimant_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  verification_method TEXT,
  verification_evidence TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMPTZ,
  reviewer_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  review_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_profile_claims_pro_id
  ON profile_claims (pro_id);

CREATE INDEX IF NOT EXISTS idx_profile_claims_claimant_user_id
  ON profile_claims (claimant_user_id);

CREATE INDEX IF NOT EXISTS idx_profile_claims_status
  ON profile_claims (status);

-- A user cannot have multiple simultaneous pending requests for the same listing.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_claims_one_pending_per_user
  ON profile_claims (pro_id, claimant_user_id)
  WHERE status = 'pending';

-- Approval should be an explicit administrative action. The application must only
-- attach pro_profiles.user_id after verification, then mark this request approved.
