-- PD-05 expand-only point policy and formal/development scope.
-- Enum values are added in a migration before they are used by movement constraints.
ALTER TYPE "point_ledger_event_type" ADD VALUE IF NOT EXISTS 'HOLDING_CAP_OVERFLOW_OUT';
ALTER TYPE "point_ledger_event_type" ADD VALUE IF NOT EXISTS 'EXPIRY_OUT';
CREATE TYPE "point_movement_type" AS ENUM ('HOLDING_CAP_OVERFLOW', 'EXPIRY');
CREATE TYPE "point_expiry_notification_status" AS ENUM ('SCHEDULED', 'SENT', 'FAILED', 'CANCELLED');

CREATE TABLE "point_policy_versions" (
  "id" UUID NOT NULL,
  "version" TEXT NOT NULL,
  "status" "policy_version_status" NOT NULL DEFAULT 'DEVELOPMENT',
  "effective_from" TIMESTAMPTZ(6) NOT NULL,
  "production_started_at" TIMESTAMPTZ(6),
  "base_award_points" INTEGER NOT NULL DEFAULT 1,
  "shipping_bonus_max" INTEGER NOT NULL DEFAULT 3,
  "transaction_total_max" INTEGER NOT NULL DEFAULT 4,
  "available_balance_cap" INTEGER NOT NULL DEFAULT 30,
  "expiry_months" INTEGER NOT NULL DEFAULT 12,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  "approved_at" TIMESTAMPTZ(6),
  "approved_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "point_policy_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "point_policy_fixed_boundaries" CHECK (
    "base_award_points" = 1
    AND "shipping_bonus_max" = 3
    AND "transaction_total_max" = 4
    AND "available_balance_cap" = 30
    AND "expiry_months" = 12
    AND "timezone" = 'Asia/Tokyo'
  ),
  CONSTRAINT "point_policy_approval_shape" CHECK (
    ("status" = 'APPROVED' AND "approved_at" IS NOT NULL AND "approved_by_id" IS NOT NULL)
    OR "status" <> 'APPROVED'
  )
);
CREATE UNIQUE INDEX "point_policy_versions_version_key" ON "point_policy_versions"("version");
CREATE INDEX "point_policy_versions_status_effective_from_idx" ON "point_policy_versions"("status", "effective_from");
ALTER TABLE "point_policy_versions" ADD CONSTRAINT "point_policy_versions_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "point_ledger_entries" ADD COLUMN "policy_version_id" UUID;
ALTER TABLE "point_ledger_entries" ADD COLUMN "awarded_at" TIMESTAMPTZ(6);
ALTER TABLE "point_ledger_entries" ADD COLUMN "expires_at" TIMESTAMPTZ(6);
ALTER TABLE "point_ledger_entries" ADD COLUMN "award_group_id" UUID;
CREATE INDEX "point_ledger_entries_user_id_policy_version_id_status_created_at_idx" ON "point_ledger_entries"("user_id", "policy_version_id", "status", "created_at");
CREATE INDEX "point_ledger_entries_expires_at_status_idx" ON "point_ledger_entries"("expires_at", "status");
CREATE INDEX "point_ledger_entries_award_group_id_idx" ON "point_ledger_entries"("award_group_id");
ALTER TABLE "point_ledger_entries" ADD CONSTRAINT "point_ledger_entries_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "point_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "point_policy_versions_immutable"
BEFORE UPDATE OR DELETE ON "point_policy_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_phase2_immutable_mutation();

-- Existing ledger rows intentionally remain NULL-scoped development entries.
