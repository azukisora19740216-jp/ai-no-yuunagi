-- PD-07 follow-up: isolate the unresolved available-balance status policy.
-- Existing policy and ledger rows are not rewritten. UNDECIDED fails closed in the application.
ALTER TABLE "point_policy_versions"
ADD COLUMN "available_balance_status_mode" TEXT NOT NULL DEFAULT 'UNDECIDED';
