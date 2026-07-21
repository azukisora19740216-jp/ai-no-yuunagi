import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { afterAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
const prisma = connectionString
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  : undefined;

describe.skipIf(!connectionString)("database foundation", () => {
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("監査イベントの更新と削除をDBで拒否する", async () => {
    const event = await prisma!.auditEvent.create({
      data: {
        actorType: "system",
        action: "foundation.tested",
        targetType: "system",
        targetId: "foundation",
        reason: "追記専用制約の統合テスト",
        requestId: crypto.randomUUID(),
        result: "SUCCEEDED",
      },
    });

    await expect(
      prisma!.auditEvent.update({ where: { id: event.id }, data: { reason: "改変" } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma!.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow(
      /append-only/,
    );
  });

  it("outboxの冪等キー重複をDBで拒否する", async () => {
    const idempotencyKey = `foundation:${crypto.randomUUID()}`;
    await prisma!.outboxEvent.create({
      data: {
        topic: "foundation.tested",
        aggregateType: "system",
        aggregateId: "foundation",
        payloadSafeJson: { safe: true },
        idempotencyKey,
      },
    });

    await expect(
      prisma!.outboxEvent.create({
        data: {
          topic: "foundation.tested",
          aggregateType: "system",
          aggregateId: "foundation",
          payloadSafeJson: { safe: true },
          idempotencyKey,
        },
      }),
    ).rejects.toThrow();
  });
});
