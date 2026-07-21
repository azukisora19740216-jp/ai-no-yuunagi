-- PD-06/07 append-only partial movements and notification scheduling.
ALTER TABLE "point_ledger_entries" DROP CONSTRAINT "point_ledger_event_shape";
ALTER TABLE "point_ledger_entries" ADD CONSTRAINT "point_ledger_event_shape" CHECK (
  ("event_type" = 'BASE_AWARD' AND "status" = 'POSTED' AND "points" = 1 AND "reversal_of" IS NULL)
  OR ("event_type" = 'SHIPPING_BONUS' AND "status" = 'POSTED' AND "points" BETWEEN 1 AND 3 AND "reversal_of" IS NULL)
  OR ("event_type" = 'AWARD_HOLD' AND "status" = 'HELD' AND "points" BETWEEN 1 AND 3 AND "reversal_of" IS NULL)
  OR ("event_type" IN ('REVERSAL', 'COMMON_POOL_TRANSFER_OUT') AND "status" = 'POSTED' AND "points" < 0 AND "reversal_of" IS NOT NULL)
  OR ("event_type" IN ('HOLDING_CAP_OVERFLOW_OUT', 'EXPIRY_OUT') AND "status" = 'POSTED' AND "points" < 0 AND "reversal_of" IS NULL AND "policy_version_id" IS NOT NULL)
) NOT VALID;
ALTER TABLE "point_ledger_entries" VALIDATE CONSTRAINT "point_ledger_event_shape";

ALTER TABLE "point_ledger_entries" ADD CONSTRAINT "formal_point_entry_shape" CHECK (
  "policy_version_id" IS NULL
  OR "event_type" IN ('REVERSAL', 'COMMON_POOL_TRANSFER_OUT')
  OR ("awarded_at" IS NOT NULL AND "expires_at" IS NOT NULL AND "award_group_id" IS NOT NULL)
) NOT VALID;
ALTER TABLE "point_ledger_entries" VALIDATE CONSTRAINT "formal_point_entry_shape";

CREATE TABLE "point_movements" (
  "id" UUID NOT NULL,
  "movement_type" "point_movement_type" NOT NULL,
  "source_point_entry_id" UUID NOT NULL,
  "user_out_entry_id" UUID NOT NULL,
  "pool_in_entry_id" UUID NOT NULL,
  "policy_version_id" UUID NOT NULL,
  "points" INTEGER NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "created_by" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "point_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "point_movements_points_positive" CHECK ("points" > 0)
);
CREATE UNIQUE INDEX "point_movements_user_out_entry_id_key" ON "point_movements"("user_out_entry_id");
CREATE UNIQUE INDEX "point_movements_pool_in_entry_id_key" ON "point_movements"("pool_in_entry_id");
CREATE UNIQUE INDEX "point_movements_idempotency_key_key" ON "point_movements"("idempotency_key");
CREATE INDEX "point_movements_source_point_entry_id_created_at_idx" ON "point_movements"("source_point_entry_id", "created_at");
CREATE INDEX "point_movements_movement_type_created_at_idx" ON "point_movements"("movement_type", "created_at");
ALTER TABLE "point_movements" ADD CONSTRAINT "point_movements_source_point_entry_id_fkey" FOREIGN KEY ("source_point_entry_id") REFERENCES "point_ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_movements" ADD CONSTRAINT "point_movements_user_out_entry_id_fkey" FOREIGN KEY ("user_out_entry_id") REFERENCES "point_ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_movements" ADD CONSTRAINT "point_movements_pool_in_entry_id_fkey" FOREIGN KEY ("pool_in_entry_id") REFERENCES "common_pool_ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_movements" ADD CONSTRAINT "point_movements_policy_version_id_fkey" FOREIGN KEY ("policy_version_id") REFERENCES "point_policy_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "point_expiry_notifications" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "point_entry_id" UUID NOT NULL,
  "notice_days" INTEGER NOT NULL,
  "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
  "status" "point_expiry_notification_status" NOT NULL DEFAULT 'SCHEDULED',
  "outbox_event_id" UUID,
  "sent_at" TIMESTAMPTZ(6),
  "failure_code" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "point_expiry_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "point_expiry_notice_days" CHECK ("notice_days" IN (60, 30, 7))
);
CREATE UNIQUE INDEX "point_expiry_notifications_outbox_event_id_key" ON "point_expiry_notifications"("outbox_event_id");
CREATE UNIQUE INDEX "point_expiry_notifications_idempotency_key_key" ON "point_expiry_notifications"("idempotency_key");
CREATE UNIQUE INDEX "point_expiry_notifications_point_entry_id_notice_days_key" ON "point_expiry_notifications"("point_entry_id", "notice_days");
CREATE INDEX "point_expiry_notifications_status_scheduled_for_idx" ON "point_expiry_notifications"("status", "scheduled_for");
CREATE INDEX "point_expiry_notifications_user_id_scheduled_for_idx" ON "point_expiry_notifications"("user_id", "scheduled_for");
ALTER TABLE "point_expiry_notifications" ADD CONSTRAINT "point_expiry_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_expiry_notifications" ADD CONSTRAINT "point_expiry_notifications_point_entry_id_fkey" FOREIGN KEY ("point_entry_id") REFERENCES "point_ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "point_expiry_notifications" ADD CONSTRAINT "point_expiry_notifications_outbox_event_id_fkey" FOREIGN KEY ("outbox_event_id") REFERENCES "outbox_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "point_movements_immutable"
BEFORE UPDATE OR DELETE ON "point_movements"
FOR EACH ROW EXECUTE FUNCTION prevent_phase2_immutable_mutation();
