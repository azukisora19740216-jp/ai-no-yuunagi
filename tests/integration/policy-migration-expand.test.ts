import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
const client = connectionString ? new Client({ connectionString }) : undefined;

const migrationNames = [
  "202607200001_foundation",
  "202607200002_phase1_identity_items",
  "202607200003_phase2_transactions_points",
  "202607210004_policy_pilot_identity_expand",
  "202607210005_transaction_facts_expand",
  "202607210006_point_policy_expand",
  "202607210007_point_movements_notifications_expand",
  "202607210008_point_projection_policy_expand",
] as const;

async function migrationSql(name: (typeof migrationNames)[number]) {
  return readFile(path.join(process.cwd(), "prisma", "migrations", name, "migration.sql"), "utf8");
}

describe.skipIf(!connectionString)("PD expand-only migrations", () => {
  afterAll(async () => client?.end());

  it("preserves the complete pre-PD point row while adding only nullable classification fields", async () => {
    await client!.connect();
    const schema = `pd_expand_${crypto.randomUUID().replaceAll("-", "")}`;
    const userId = crypto.randomUUID();
    const entryId = crypto.randomUUID();

    await client!.query(`CREATE SCHEMA "${schema}"`);
    try {
      await client!.query(`SET search_path TO "${schema}", public`);
      for (const name of migrationNames.slice(0, 3)) {
        await client!.query(await migrationSql(name));
      }
      await client!.query(
        `INSERT INTO users (id, name, email, email_verified, status, created_at, updated_at)
         VALUES ($1, 'existing member', $2, true, 'ACTIVE', now(), now())`,
        [userId, `existing-${userId}@example.invalid`],
      );
      await client!.query(
        `INSERT INTO point_ledger_entries
          (id, user_id, event_type, points, reason, created_by, status, idempotency_key)
         VALUES ($1, $2, 'BASE_AWARD', 1, 'pre-PD development row', 'migration-test', 'POSTED', $3)`,
        [entryId, userId, `pre-pd:${entryId}`],
      );
      const before = await client!.query(
        `SELECT id, transaction_id, user_id, event_type::text, points, reason, created_by,
                reversal_of, status::text, idempotency_key, metadata_safe_json, created_at
           FROM point_ledger_entries WHERE id = $1`,
        [entryId],
      );

      for (const name of migrationNames.slice(3)) {
        await client!.query(await migrationSql(name));
      }

      const after = await client!.query(
        `SELECT id, transaction_id, user_id, event_type::text, points, reason, created_by,
                reversal_of, status::text, idempotency_key, metadata_safe_json, created_at,
                policy_version_id, awarded_at, expires_at, award_group_id
           FROM point_ledger_entries WHERE id = $1`,
        [entryId],
      );
      expect(after.rowCount).toBe(1);
      expect(after.rows[0]).toMatchObject({
        ...before.rows[0],
        policy_version_id: null,
        awarded_at: null,
        expires_at: null,
        award_group_id: null,
      });
      expect(
        await client!.query(`SELECT count(*)::int AS count FROM point_ledger_entries`),
      ).toMatchObject({ rows: [{ count: 1 }] });
    } finally {
      await client!.query(`SET search_path TO public`);
      await client!.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
  });
});
