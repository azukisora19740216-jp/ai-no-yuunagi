import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { CurrentActor } from "@/modules/identity/application/current-actor";
import {
  appendPointMovement,
  getActiveFormalPointPolicy,
  postFormalTransactionAward,
} from "@/modules/points/application/formal-point-service";
import { expirePointEntry } from "@/modules/points/application/point-expiry-service";
import { getUserPointLedger } from "@/modules/points/application/point-ledger-queries";
import { reviewTransactionCompletion } from "@/modules/transactions/application/transaction-service";
import { resetServerEnvForTests } from "@/shared/config/env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
const prisma = connectionString
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  : undefined;
const originalPointEnv = {
  FEATURE_PILOT_ENROLLMENT: process.env.FEATURE_PILOT_ENROLLMENT,
  FEATURE_KYC_GATES: process.env.FEATURE_KYC_GATES,
  FEATURE_FORMAL_POINTS: process.env.FEATURE_FORMAL_POINTS,
  FEATURE_POINT_EXPIRY: process.env.FEATURE_POINT_EXPIRY,
  FEATURE_POINT_EXPIRY_NOTIFICATIONS: process.env.FEATURE_POINT_EXPIRY_NOTIFICATIONS,
};

const administrator: CurrentActor = {
  id: crypto.randomUUID(),
  name: "Point administrator",
  email: `point-admin-${crypto.randomUUID()}@example.invalid`,
  emailVerified: true,
  status: "ACTIVE",
  roles: ["ADMINISTRATOR"],
};
let pointPolicyId = "";
let categoryId = "";

async function createUser(label: string): Promise<CurrentActor> {
  const actor: CurrentActor = {
    id: crypto.randomUUID(),
    name: label,
    email: `${label}-${crypto.randomUUID()}@example.invalid`,
    emailVerified: true,
    status: "ACTIVE",
    roles: ["USER"],
  };
  await prisma!.user.create({
    data: { id: actor.id, name: actor.name, email: actor.email, emailVerified: true },
  });
  return actor;
}

async function createReviewFixture(
  provider: CurrentActor,
  deliveryMethod: "HANDOVER" | "SHIPPING",
) {
  const recipient = await createUser("point-recipient");
  const item = await prisma!.item.create({
    data: {
      ownerUserId: provider.id,
      categoryId,
      title: "Formal point fixture",
      description: "A direct, gratuitous transfer fixture.",
      condition: "GOOD",
      deliveryMethod,
      handoverArea: "倉敷市",
      availableDates: ["agreed"],
      shippingSupported: deliveryMethod === "SHIPPING",
      status: "HANDOVER_IN_PROGRESS",
    },
  });
  const request = await prisma!.itemRequest.create({
    data: {
      itemId: item.id,
      requesterUserId: recipient.id,
      message: "request",
      status: "SELECTED",
      selectedAt: new Date(),
      selectedByUserId: provider.id,
    },
  });
  const now = new Date();
  const transaction = await prisma!.transaction.create({
    data: {
      itemId: item.id,
      selectedRequestId: request.id,
      providerUserId: provider.id,
      recipientUserId: recipient.id,
      status: "UNDER_ADMIN_REVIEW",
      providerReportedAt: now,
      recipientReportedAt: now,
      bothReportedAt: now,
      handoverOccurredAt: now,
    },
  });
  return transaction;
}

async function appendFormalBaseEntries(userId: string, count: number) {
  const awardedAt = new Date();
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  await prisma!.pointLedgerEntry.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      userId,
      eventType: "BASE_AWARD" as const,
      points: 1,
      reason: "integration balance fixture",
      createdBy: administrator.id,
      status: "POSTED" as const,
      idempotencyKey: `formal-prefill:${userId}:${index}`,
      policyVersionId: pointPolicyId,
      awardedAt,
      expiresAt,
      awardGroupId: crypto.randomUUID(),
    })),
  });
}

describe.skipIf(!connectionString)("PD-04..07 formal point ledger, cap and expiry", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = connectionString;
    process.env.APP_URL = "http://127.0.0.1:3000";
    process.env.AUTH_SECRET = "integration-test-auth-secret-at-least-32-characters";
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1025";
    process.env.MAIL_FROM = "test@example.invalid";
    process.env.FEATURE_PILOT_ENROLLMENT = "false";
    process.env.FEATURE_KYC_GATES = "false";
    process.env.FEATURE_FORMAL_POINTS = "true";
    process.env.FEATURE_POINT_EXPIRY = "true";
    process.env.FEATURE_POINT_EXPIRY_NOTIFICATIONS = "true";
    resetServerEnvForTests();

    await prisma!.user.create({
      data: {
        id: administrator.id,
        name: administrator.name,
        email: administrator.email,
        emailVerified: true,
      },
    });
    pointPolicyId = (
      await prisma!.pointPolicyVersion.create({
        data: {
          version: `formal-test-${crypto.randomUUID()}`,
          status: "APPROVED",
          effectiveFrom: new Date(Date.now() - 60_000),
          productionStartedAt: new Date(Date.now() - 60_000),
          availableBalanceStatusMode: "POSTED_ONLY",
          approvedAt: new Date(),
          approvedById: administrator.id,
        },
      })
    ).id;
    categoryId = (
      await prisma!.category.create({
        data: { slug: `formal-points-${crypto.randomUUID()}`, name: "Formal points test" },
      })
    ).id;
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(originalPointEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetServerEnvForTests();
    await prisma?.$disconnect();
  });

  it("keeps pre-production development rows out of the formal balance", async () => {
    const user = await createUser("development-scope");
    await prisma!.pointLedgerEntry.create({
      data: {
        userId: user.id,
        eventType: "BASE_AWARD",
        points: 1,
        reason: "pre-production development row",
        createdBy: administrator.id,
        status: "POSTED",
        idempotencyKey: `development:${crypto.randomUUID()}`,
      },
    });
    const ledger = await getUserPointLedger(user.id);
    expect(ledger).toMatchObject({ formalEnabled: true, formalBalance: 0, developmentBalance: 1 });
    expect(ledger.balance).toBe(0);
  });

  it("does not create formal points before both reports and operational confirmation", async () => {
    const provider = await createUser("not-confirmed");
    const transaction = await createReviewFixture(provider, "HANDOVER");
    expect(await prisma!.pointLedgerEntry.count({ where: { transactionId: transaction.id } })).toBe(
      0,
    );
  });

  it("splits only the over-cap portion and records user/pool movement atomically", async () => {
    const provider = await createUser("cap-split");
    await appendFormalBaseEntries(provider.id, 29);
    const transaction = await createReviewFixture(provider, "SHIPPING");
    const result = await reviewTransactionCompletion(administrator, transaction.id, {
      decision: "APPROVE",
      shippingWorkloadLevel: "STANDARD",
      reason: "operational confirmation test",
    });
    expect(result).toMatchObject({ postedPoints: 3, overflowPoints: 2 });

    const formalBalance = await prisma!.pointLedgerEntry.aggregate({
      where: { userId: provider.id, policyVersionId: { not: null }, status: "POSTED" },
      _sum: { points: true },
    });
    expect(formalBalance._sum.points).toBe(30);
    const movement = await prisma!.pointMovement.findFirstOrThrow({
      where: {
        sourcePointEntry: { transactionId: transaction.id },
        movementType: "HOLDING_CAP_OVERFLOW",
      },
      include: { userOutEntry: true, poolInEntry: true },
    });
    expect(movement.points).toBe(2);
    expect(movement.userOutEntry.points).toBe(-2);
    expect(movement.poolInEntry.points).toBe(2);
    expect(movement.createdAt.getTime()).toBeGreaterThan(0);
    expect(
      await prisma!.pointExpiryNotification.count({
        where: { pointEntry: { transactionId: transaction.id } },
      }),
    ).toBe(6);
  });

  it("serializes simultaneous awards so formal available balance never exceeds 30", async () => {
    const provider = await createUser("concurrent-cap");
    await appendFormalBaseEntries(provider.id, 29);
    const first = await createReviewFixture(provider, "HANDOVER");
    const second = await createReviewFixture(provider, "HANDOVER");
    const results = await Promise.allSettled([
      reviewTransactionCompletion(administrator, first.id, {
        decision: "APPROVE",
        shippingWorkloadLevel: "NONE",
        reason: "concurrent confirmation one",
      }),
      reviewTransactionCompletion(administrator, second.id, {
        decision: "APPROVE",
        shippingWorkloadLevel: "NONE",
        reason: "concurrent confirmation two",
      }),
    ]);
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    const balance = await prisma!.pointLedgerEntry.aggregate({
      where: { userId: provider.id, policyVersionId: { not: null }, status: "POSTED" },
      _sum: { points: true },
    });
    expect(balance._sum.points).toBe(30);
    expect(
      await prisma!.pointMovement.aggregate({
        where: {
          movementType: "HOLDING_CAP_OVERFLOW",
          sourcePointEntry: { transactionId: { in: [first.id, second.id] } },
        },
        _sum: { points: true },
      }),
    ).toMatchObject({ _sum: { points: 1 } });
  });

  it("expires only the remaining portion, without mutating the source, and rejects a duplicate", async () => {
    const user = await createUser("partial-expiry");
    const awardedAt = new Date("2024-01-15T00:00:00.000Z");
    const source = await prisma!.pointLedgerEntry.create({
      data: {
        userId: user.id,
        eventType: "SHIPPING_BONUS",
        points: 3,
        reason: "partial expiry fixture",
        createdBy: administrator.id,
        status: "POSTED",
        idempotencyKey: `partial-expiry-source:${crypto.randomUUID()}`,
        policyVersionId: pointPolicyId,
        awardedAt,
        expiresAt: new Date("2025-01-31T15:00:00.000Z"),
        awardGroupId: crypto.randomUUID(),
      },
    });
    await prisma!.$transaction((transaction) =>
      appendPointMovement(transaction, {
        movementType: "HOLDING_CAP_OVERFLOW",
        sourceEntry: source,
        points: 1,
        reason: "prior partial cap movement",
        createdBy: administrator.id,
        idempotencyKey: `partial-before-expiry:${source.id}`,
      }),
    );
    const before = await prisma!.pointLedgerEntry.findUniqueOrThrow({ where: { id: source.id } });
    const expired = await expirePointEntry(administrator, source.id, new Date());
    expect(expired.movement.points).toBe(2);
    expect(await prisma!.pointLedgerEntry.findUniqueOrThrow({ where: { id: source.id } })).toEqual(
      before,
    );
    await expect(expirePointEntry(administrator, source.id, new Date())).rejects.toMatchObject({
      code: "POINT_ENTRY_ALREADY_EXPIRED_OR_MOVED",
    });
    await expect(
      prisma!.pointMovement.update({
        where: { id: expired.movement.id },
        data: { points: 1 },
      }),
    ).rejects.toThrow(/append-only/);
  });

  it("rejects duplicate overflow idempotency and unauthorized expiry operations", async () => {
    const user = await createUser("movement-duplicate");
    const source = await prisma!.pointLedgerEntry.create({
      data: {
        userId: user.id,
        eventType: "BASE_AWARD",
        points: 1,
        reason: "movement duplicate fixture",
        createdBy: administrator.id,
        status: "POSTED",
        idempotencyKey: `movement-source:${crypto.randomUUID()}`,
        policyVersionId: pointPolicyId,
        awardedAt: new Date("2024-01-01T00:00:00.000Z"),
        expiresAt: new Date("2025-01-31T15:00:00.000Z"),
        awardGroupId: crypto.randomUUID(),
      },
    });
    const key = `movement-once:${source.id}`;
    await prisma!.$transaction((transaction) =>
      appendPointMovement(transaction, {
        movementType: "HOLDING_CAP_OVERFLOW",
        sourceEntry: source,
        points: 1,
        reason: "first movement",
        createdBy: administrator.id,
        idempotencyKey: key,
      }),
    );
    await expect(
      prisma!.$transaction((transaction) =>
        appendPointMovement(transaction, {
          movementType: "HOLDING_CAP_OVERFLOW",
          sourceEntry: source,
          points: 1,
          reason: "duplicate movement",
          createdBy: administrator.id,
          idempotencyKey: key,
        }),
      ),
    ).rejects.toThrow();
    await expect(expirePointEntry(user, source.id, new Date())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses a formal award outside the approved 1 + 0..3 policy", async () => {
    await expect(
      prisma!.$transaction((transaction) =>
        postFormalTransactionAward(transaction, {
          transactionId: crypto.randomUUID(),
          userId: administrator.id,
          basePoints: 2,
          shippingBonus: 0,
          reason: "invalid award shape",
          createdBy: administrator.id,
        }),
      ),
    ).rejects.toThrow();
  });

  it("preserves the legacy development-ledger behavior while the formal feature flag is off", async () => {
    process.env.FEATURE_FORMAL_POINTS = "false";
    resetServerEnvForTests();
    try {
      const provider = await createUser("feature-off");
      const transaction = await createReviewFixture(provider, "HANDOVER");
      await reviewTransactionCompletion(administrator, transaction.id, {
        decision: "APPROVE",
        shippingWorkloadLevel: "NONE",
        reason: "feature-off compatibility",
      });
      const entry = await prisma!.pointLedgerEntry.findFirstOrThrow({
        where: { transactionId: transaction.id, eventType: "BASE_AWARD" },
      });
      expect(entry).toMatchObject({ points: 1, policyVersionId: null, expiresAt: null });
    } finally {
      process.env.FEATURE_FORMAL_POINTS = "true";
      resetServerEnvForTests();
    }
  });

  it("fails closed while the available-balance status policy remains undecided", async () => {
    const effectiveFrom = new Date(Date.now() + 1_000);
    await prisma!.pointPolicyVersion.create({
      data: {
        version: `undecided-status-${crypto.randomUUID()}`,
        status: "APPROVED",
        effectiveFrom,
        productionStartedAt: effectiveFrom,
        approvedAt: new Date(),
        approvedById: administrator.id,
      },
    });
    await expect(
      prisma!.$transaction((transaction) =>
        getActiveFormalPointPolicy(transaction, new Date(effectiveFrom.getTime() + 1_000)),
      ),
    ).rejects.toMatchObject({ code: "FORMAL_POINT_POLICY_INVALID" });
  });
});
