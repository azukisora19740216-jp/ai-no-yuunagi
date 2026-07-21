-- Phase 2: transaction state machine and append-only Okagesama point ledgers.
CREATE TYPE "transaction_status" AS ENUM (
  'REQUESTED',
  'RECIPIENT_SELECTED',
  'ACCEPTED',
  'HANDOVER_SCHEDULED',
  'PROVIDER_REPORTED_COMPLETE',
  'RECIPIENT_REPORTED_COMPLETE',
  'UNDER_ADMIN_REVIEW',
  'COMPLETED',
  'DISPUTED',
  'CANCELLED',
  'SUSPENDED'
);

CREATE TYPE "shipping_workload_level" AS ENUM ('NONE', 'SIMPLE', 'STANDARD', 'LARGE_SPECIAL');
CREATE TYPE "point_ledger_event_type" AS ENUM (
  'BASE_AWARD',
  'SHIPPING_BONUS',
  'AWARD_HOLD',
  'REVERSAL',
  'COMMON_POOL_TRANSFER_OUT'
);
CREATE TYPE "point_ledger_status" AS ENUM ('POSTED', 'HELD');
CREATE TYPE "common_pool_event_type" AS ENUM ('TRANSFER_IN');
CREATE TYPE "common_pool_reason" AS ENUM (
  'UNSPECIFIED',
  'EXPIRED',
  'HOLDING_LIMIT_EXCEEDED',
  'CORRECTION'
);

CREATE TABLE "transactions" (
  "id" UUID NOT NULL,
  "item_id" UUID NOT NULL,
  "selected_request_id" UUID NOT NULL,
  "provider_user_id" UUID NOT NULL,
  "recipient_user_id" UUID NOT NULL,
  "status" "transaction_status" NOT NULL DEFAULT 'RECIPIENT_SELECTED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "provider_reported_at" TIMESTAMPTZ(6),
  "recipient_reported_at" TIMESTAMPTZ(6),
  "shipping_workload_level" "shipping_workload_level" NOT NULL DEFAULT 'NONE',
  "admin_verified_at" TIMESTAMPTZ(6),
  "admin_verified_by_id" UUID,
  "completed_at" TIMESTAMPTZ(6),
  "status_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "transactions_distinct_participants" CHECK ("provider_user_id" <> "recipient_user_id")
);
CREATE UNIQUE INDEX "transactions_item_id_key" ON "transactions"("item_id");
CREATE UNIQUE INDEX "transactions_selected_request_id_key" ON "transactions"("selected_request_id");
CREATE INDEX "transactions_provider_user_id_status_updated_at_idx" ON "transactions"("provider_user_id", "status", "updated_at");
CREATE INDEX "transactions_recipient_user_id_status_updated_at_idx" ON "transactions"("recipient_user_id", "status", "updated_at");
CREATE INDEX "transactions_status_updated_at_idx" ON "transactions"("status", "updated_at");
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_selected_request_id_fkey" FOREIGN KEY ("selected_request_id") REFERENCES "item_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_provider_user_id_fkey" FOREIGN KEY ("provider_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "transaction_status_events" (
  "id" UUID NOT NULL,
  "transaction_id" UUID NOT NULL,
  "from_status" "transaction_status" NOT NULL,
  "to_status" "transaction_status" NOT NULL,
  "event_type" TEXT NOT NULL,
  "actor_user_id" UUID,
  "actor_role" TEXT,
  "reason" TEXT NOT NULL,
  "metadata_safe_json" JSONB,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transaction_status_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "transaction_status_events_idempotency_key_key" ON "transaction_status_events"("idempotency_key");
CREATE INDEX "transaction_status_events_transaction_id_created_at_idx" ON "transaction_status_events"("transaction_id", "created_at");
CREATE INDEX "transaction_status_events_to_status_created_at_idx" ON "transaction_status_events"("to_status", "created_at");
ALTER TABLE "transaction_status_events" ADD CONSTRAINT "transaction_status_events_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "point_ledger_entries" (
  "id" UUID NOT NULL,
  "transaction_id" UUID,
  "user_id" UUID NOT NULL,
  "event_type" "point_ledger_event_type" NOT NULL,
  "points" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  "reversal_of" UUID,
  "status" "point_ledger_status" NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "metadata_safe_json" JSONB,
  CONSTRAINT "point_ledger_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "point_ledger_points_nonzero" CHECK ("points" <> 0),
  CONSTRAINT "point_ledger_event_shape" CHECK (
    ("event_type" = 'BASE_AWARD' AND "status" = 'POSTED' AND "points" = 1 AND "reversal_of" IS NULL)
    OR ("event_type" = 'SHIPPING_BONUS' AND "status" = 'POSTED' AND "points" BETWEEN 1 AND 3 AND "reversal_of" IS NULL)
    OR ("event_type" = 'AWARD_HOLD' AND "status" = 'HELD' AND "points" BETWEEN 1 AND 3 AND "reversal_of" IS NULL)
    OR ("event_type" IN ('REVERSAL', 'COMMON_POOL_TRANSFER_OUT') AND "status" = 'POSTED' AND "points" < 0 AND "reversal_of" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "point_ledger_entries_reversal_of_key" ON "point_ledger_entries"("reversal_of");
CREATE UNIQUE INDEX "point_ledger_entries_idempotency_key_key" ON "point_ledger_entries"("idempotency_key");
CREATE INDEX "point_ledger_entries_user_id_created_at_id_idx" ON "point_ledger_entries"("user_id", "created_at", "id");
CREATE INDEX "point_ledger_entries_transaction_id_event_type_status_idx" ON "point_ledger_entries"("transaction_id", "event_type", "status");
CREATE INDEX "point_ledger_entries_status_created_at_idx" ON "point_ledger_entries"("status", "created_at");
ALTER TABLE "point_ledger_entries" ADD CONSTRAINT "point_ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_ledger_entries" ADD CONSTRAINT "point_ledger_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_ledger_entries" ADD CONSTRAINT "point_ledger_entries_reversal_of_fkey" FOREIGN KEY ("reversal_of") REFERENCES "point_ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "common_pool_ledger_entries" (
  "id" UUID NOT NULL,
  "source_point_ledger_entry_id" UUID NOT NULL,
  "event_type" "common_pool_event_type" NOT NULL,
  "reason_category" "common_pool_reason" NOT NULL,
  "points" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  CONSTRAINT "common_pool_ledger_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "common_pool_points_positive" CHECK ("points" > 0)
);
CREATE UNIQUE INDEX "common_pool_ledger_entries_source_point_ledger_entry_id_key" ON "common_pool_ledger_entries"("source_point_ledger_entry_id");
CREATE UNIQUE INDEX "common_pool_ledger_entries_idempotency_key_key" ON "common_pool_ledger_entries"("idempotency_key");
CREATE INDEX "common_pool_ledger_entries_created_at_id_idx" ON "common_pool_ledger_entries"("created_at", "id");
CREATE INDEX "common_pool_ledger_entries_reason_category_created_at_idx" ON "common_pool_ledger_entries"("reason_category", "created_at");
ALTER TABLE "common_pool_ledger_entries" ADD CONSTRAINT "common_pool_ledger_entries_source_point_ledger_entry_id_fkey" FOREIGN KEY ("source_point_ledger_entry_id") REFERENCES "point_ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill development/test selections created before Phase 2.
INSERT INTO "transactions" (
  "id", "item_id", "selected_request_id", "provider_user_id", "recipient_user_id", "status", "updated_at"
)
SELECT gen_random_uuid(), ir."item_id", ir."id", i."owner_user_id", ir."requester_user_id", 'RECIPIENT_SELECTED', CURRENT_TIMESTAMP
FROM "item_requests" ir
JOIN "items" i ON i."id" = ir."item_id"
WHERE ir."status" = 'SELECTED'
ON CONFLICT DO NOTHING;

INSERT INTO "transaction_status_events" (
  "id", "transaction_id", "from_status", "to_status", "event_type", "actor_user_id", "actor_role", "reason", "idempotency_key"
)
SELECT gen_random_uuid(), t."id", 'REQUESTED', 'RECIPIENT_SELECTED', 'recipient_selected', t."provider_user_id", 'USER', 'Phase 2 migration backfill', 'transaction:' || t."id" || ':selected:backfill'
FROM "transactions" t
ON CONFLICT DO NOTHING;

-- Business history and both point ledgers are append-only.
CREATE OR REPLACE FUNCTION prevent_phase2_immutable_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transaction_status_events_immutable"
BEFORE UPDATE OR DELETE ON "transaction_status_events"
FOR EACH ROW EXECUTE FUNCTION prevent_phase2_immutable_mutation();

CREATE TRIGGER "point_ledger_entries_immutable"
BEFORE UPDATE OR DELETE ON "point_ledger_entries"
FOR EACH ROW EXECUTE FUNCTION prevent_phase2_immutable_mutation();

CREATE TRIGGER "common_pool_ledger_entries_immutable"
BEFORE UPDATE OR DELETE ON "common_pool_ledger_entries"
FOR EACH ROW EXECUTE FUNCTION prevent_phase2_immutable_mutation();
