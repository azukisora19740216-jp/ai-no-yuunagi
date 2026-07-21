import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { DeliveryMethod, TransactionStatus } from "@/generated/prisma/enums";
import type { CurrentActor } from "@/modules/identity/application/current-actor";
import {
  reversePointEntry,
  transferPointEntryToCommonPool,
} from "@/modules/points/application/point-ledger-service";
import {
  reportProviderComplete,
  reportRecipientComplete,
  reviewTransactionCompletion,
} from "@/modules/transactions/application/transaction-service";
import { afterAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
const prisma = connectionString
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  : undefined;

type Fixture = {
  transactionId: string;
  provider: CurrentActor;
  recipient: CurrentActor;
  moderator: CurrentActor;
  administrator: CurrentActor;
};

async function createFixture(
  status: TransactionStatus,
  deliveryMethod: DeliveryMethod = "SHIPPING",
): Promise<Fixture> {
  const suffix = crypto.randomUUID();
  const provider: CurrentActor = {
    id: crypto.randomUUID(),
    name: "Phase2提供者",
    email: `phase2-provider-${suffix}@example.invalid`,
    emailVerified: true,
    status: "ACTIVE",
    roles: ["USER"],
  };
  const recipient: CurrentActor = {
    id: crypto.randomUUID(),
    name: "Phase2受取人",
    email: `phase2-recipient-${suffix}@example.invalid`,
    emailVerified: true,
    status: "ACTIVE",
    roles: ["USER"],
  };
  const moderator: CurrentActor = {
    id: crypto.randomUUID(),
    name: "Phase2確認者",
    email: `phase2-moderator-${suffix}@example.invalid`,
    emailVerified: true,
    status: "ACTIVE",
    roles: ["MODERATOR"],
  };
  const administrator: CurrentActor = {
    id: crypto.randomUUID(),
    name: "Phase2管理者",
    email: `phase2-admin-${suffix}@example.invalid`,
    emailVerified: true,
    status: "ACTIVE",
    roles: ["ADMINISTRATOR"],
  };
  for (const actor of [provider, recipient, moderator, administrator]) {
    await prisma!.user.create({
      data: { id: actor.id, email: actor.email, name: actor.name, emailVerified: true },
    });
  }
  const category = await prisma!.category.create({
    data: { slug: `phase2-${suffix}`, name: "Phase2テスト" },
  });
  const item = await prisma!.item.create({
    data: {
      ownerUserId: provider.id,
      categoryId: category.id,
      title: "Phase2統合テスト物品",
      description: "金額や送料額を持たないテスト物品です。",
      condition: "GOOD",
      deliveryMethod,
      handoverArea: "テスト地域",
      availableDates: ["調整済み"],
      shippingSupported: deliveryMethod === "SHIPPING",
      status: "HANDOVER_IN_PROGRESS",
    },
  });
  const request = await prisma!.itemRequest.create({
    data: {
      itemId: item.id,
      requesterUserId: recipient.id,
      message: "Phase2テスト申込み",
      status: "SELECTED",
      selectedAt: new Date(),
      selectedByUserId: provider.id,
    },
  });
  const transaction = await prisma!.transaction.create({
    data: {
      itemId: item.id,
      selectedRequestId: request.id,
      providerUserId: provider.id,
      recipientUserId: recipient.id,
      status,
      providerReportedAt: ["PROVIDER_REPORTED_COMPLETE", "UNDER_ADMIN_REVIEW", "DISPUTED"].includes(
        status,
      )
        ? new Date()
        : null,
      recipientReportedAt: [
        "RECIPIENT_REPORTED_COMPLETE",
        "UNDER_ADMIN_REVIEW",
        "DISPUTED",
      ].includes(status)
        ? new Date()
        : null,
    },
  });
  return { transactionId: transaction.id, provider, recipient, moderator, administrator };
}

describe.skipIf(!connectionString)("phase 2 transaction and point integrity", () => {
  afterAll(async () => prisma?.$disconnect());

  it("does not post points before administrator confirmation", async () => {
    const fixture = await createFixture("UNDER_ADMIN_REVIEW");
    expect(
      await prisma!.pointLedgerEntry.count({ where: { transactionId: fixture.transactionId } }),
    ).toBe(0);
  });

  it("prevents duplicate awards during concurrent administrator confirmation", async () => {
    const fixture = await createFixture("UNDER_ADMIN_REVIEW");
    const input = {
      decision: "APPROVE" as const,
      shippingWorkloadLevel: "STANDARD" as const,
      reason: "双方報告と作業区分を確認",
    };
    const results = await Promise.allSettled([
      reviewTransactionCompletion(fixture.moderator, fixture.transactionId, input),
      reviewTransactionCompletion(fixture.moderator, fixture.transactionId, input),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);

    const entries = await prisma!.pointLedgerEntry.findMany({
      where: { transactionId: fixture.transactionId, status: "POSTED" },
    });
    expect(entries).toHaveLength(2);
    expect(entries.reduce((sum, entry) => sum + entry.points, 0)).toBe(3);
    expect(entries.filter(({ eventType }) => eventType === "BASE_AWARD")).toHaveLength(1);
    expect(entries.filter(({ eventType }) => eventType === "SHIPPING_BONUS")).toHaveLength(1);
  });

  it("keeps simultaneous completion reports consistent and allows safe retry", async () => {
    const fixture = await createFixture("HANDOVER_SCHEDULED");
    const results = await Promise.allSettled([
      reportProviderComplete(fixture.provider, fixture.transactionId),
      reportRecipientComplete(fixture.recipient, fixture.transactionId),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled").length).toBeGreaterThanOrEqual(1);

    const afterRace = await prisma!.transaction.findUniqueOrThrow({
      where: { id: fixture.transactionId },
    });
    if (afterRace.status === "PROVIDER_REPORTED_COMPLETE") {
      await reportRecipientComplete(fixture.recipient, fixture.transactionId);
    } else if (afterRace.status === "RECIPIENT_REPORTED_COMPLETE") {
      await reportProviderComplete(fixture.provider, fixture.transactionId);
    }
    const completedReports = await prisma!.transaction.findUniqueOrThrow({
      where: { id: fixture.transactionId },
    });
    expect(completedReports.status).toBe("UNDER_ADMIN_REVIEW");
    expect(completedReports.providerReportedAt).not.toBeNull();
    expect(completedReports.recipientReportedAt).not.toBeNull();
    expect(
      await prisma!.pointLedgerEntry.count({ where: { transactionId: fixture.transactionId } }),
    ).toBe(0);
  });

  it("holds points outside the balance and posts new entries after resolution", async () => {
    const fixture = await createFixture("UNDER_ADMIN_REVIEW", "HANDOVER");
    await reviewTransactionCompletion(fixture.moderator, fixture.transactionId, {
      decision: "HOLD",
      shippingWorkloadLevel: "NONE",
      reason: "追加確認が必要",
    });
    const held = await prisma!.pointLedgerEntry.findMany({
      where: { transactionId: fixture.transactionId },
    });
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ points: 1, status: "HELD", eventType: "AWARD_HOLD" });
    expect(
      (
        await prisma!.pointLedgerEntry.aggregate({
          where: { userId: fixture.provider.id, status: "POSTED" },
          _sum: { points: true },
        })
      )._sum.points ?? 0,
    ).toBe(0);

    await reviewTransactionCompletion(fixture.moderator, fixture.transactionId, {
      decision: "APPROVE",
      shippingWorkloadLevel: "NONE",
      reason: "追加確認完了",
    });
    const posted = await prisma!.pointLedgerEntry.findMany({
      where: { transactionId: fixture.transactionId, status: "POSTED" },
    });
    expect(posted).toHaveLength(1);
    expect(posted[0]?.points).toBe(1);
  });

  it("uses one reversal or common-pool transfer per source entry", async () => {
    const reversalFixture = await createFixture("UNDER_ADMIN_REVIEW", "HANDOVER");
    await reviewTransactionCompletion(reversalFixture.moderator, reversalFixture.transactionId, {
      decision: "APPROVE",
      shippingWorkloadLevel: "NONE",
      reason: "確認完了",
    });
    const base = await prisma!.pointLedgerEntry.findFirstOrThrow({
      where: { transactionId: reversalFixture.transactionId, eventType: "BASE_AWARD" },
    });
    await reversePointEntry(reversalFixture.administrator, base.id, "不正取引の確認による取消し");
    await expect(
      reversePointEntry(reversalFixture.administrator, base.id, "二重取消し"),
    ).rejects.toMatchObject({ code: "POINT_ENTRY_ALREADY_REVERSED" });

    const poolFixture = await createFixture("UNDER_ADMIN_REVIEW", "SHIPPING");
    await reviewTransactionCompletion(poolFixture.moderator, poolFixture.transactionId, {
      decision: "APPROVE",
      shippingWorkloadLevel: "SIMPLE",
      reason: "確認完了",
    });
    const shipping = await prisma!.pointLedgerEntry.findFirstOrThrow({
      where: { transactionId: poolFixture.transactionId, eventType: "SHIPPING_BONUS" },
    });
    await transferPointEntryToCommonPool(
      poolFixture.administrator,
      shipping.id,
      "EXPIRED",
      "期限条件のテスト",
    );
    await expect(
      transferPointEntryToCommonPool(poolFixture.administrator, shipping.id, "EXPIRED", "二重移行"),
    ).rejects.toMatchObject({ code: "POINT_ENTRY_ALREADY_CONSUMED" });
    const poolEntry = await prisma!.commonPoolLedgerEntry.findUniqueOrThrow({
      where: { idempotencyKey: `common-pool-transfer-in:${shipping.id}` },
    });
    expect(poolEntry.points).toBe(1);
  });

  it("rejects updates and deletes on all append-only phase 2 records", async () => {
    const fixture = await createFixture("UNDER_ADMIN_REVIEW", "HANDOVER");
    await reviewTransactionCompletion(fixture.moderator, fixture.transactionId, {
      decision: "APPROVE",
      shippingWorkloadLevel: "NONE",
      reason: "追記専用テスト",
    });
    const entry = await prisma!.pointLedgerEntry.findFirstOrThrow({
      where: { transactionId: fixture.transactionId, eventType: "BASE_AWARD" },
    });
    await expect(
      prisma!.pointLedgerEntry.update({ where: { id: entry.id }, data: { reason: "上書き" } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma!.pointLedgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow(
      /append-only/,
    );
    const statusEvent = await prisma!.transactionStatusEvent.findFirstOrThrow({
      where: { transactionId: fixture.transactionId },
    });
    await expect(
      prisma!.transactionStatusEvent.delete({ where: { id: statusEvent.id } }),
    ).rejects.toThrow(/append-only/);

    const { poolEntry } = await transferPointEntryToCommonPool(
      fixture.administrator,
      entry.id,
      "CORRECTION",
      "追記専用テスト",
    );
    await expect(
      prisma!.commonPoolLedgerEntry.update({
        where: { id: poolEntry.id },
        data: { reason: "上書き" },
      }),
    ).rejects.toThrow(/append-only/);
  });
});
