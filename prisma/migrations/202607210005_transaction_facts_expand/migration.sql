-- PD-04 expand-only transaction fact timestamps. Existing columns remain unchanged.
ALTER TABLE "transactions" ADD COLUMN "both_reported_at" TIMESTAMPTZ(6);
ALTER TABLE "transactions" ADD COLUMN "handover_occurred_at" TIMESTAMPTZ(6);
ALTER TABLE "transactions" ADD COLUMN "admin_finalized_at" TIMESTAMPTZ(6);
ALTER TABLE "transactions" ADD COLUMN "admin_finalized_by_id" UUID;
CREATE INDEX "transactions_admin_finalized_at_idx" ON "transactions"("admin_finalized_at");
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_admin_finalized_by_id_fkey" FOREIGN KEY ("admin_finalized_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- No backfill is performed: existing development rows must not be interpreted as ownership facts.
