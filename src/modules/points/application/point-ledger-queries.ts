import { getPrisma } from "@/shared/db/prisma";
import { getServerEnv } from "@/shared/config/env";

export async function getUserPointLedger(userId: string) {
  const prisma = getPrisma();
  const now = new Date();
  const formalEnabled = getServerEnv().FEATURE_FORMAL_POINTS;
  const [entries, formalAggregate, developmentAggregate, notifications] = await Promise.all([
    prisma.pointLedgerEntry.findMany({
      where: { userId },
      include: {
        transaction: { select: { item: { select: { title: true } } } },
        reversalOf: true,
        policyVersion: { select: { version: true, productionStartedAt: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
    }),
    prisma.pointLedgerEntry.aggregate({
      where: {
        userId,
        status: "POSTED",
        policyVersion: {
          status: "APPROVED",
          productionStartedAt: { not: null, lte: now },
          availableBalanceStatusMode: "POSTED_ONLY",
        },
      },
      _sum: { points: true },
    }),
    prisma.pointLedgerEntry.aggregate({
      where: { userId, status: "POSTED", policyVersionId: null },
      _sum: { points: true },
    }),
    prisma.pointExpiryNotification.findMany({
      where: { userId },
      select: { pointEntryId: true, noticeDays: true, scheduledFor: true, status: true },
      orderBy: { scheduledFor: "asc" },
      take: 100,
    }),
  ]);
  const formalBalance = formalAggregate._sum.points ?? 0;
  const developmentBalance = developmentAggregate._sum.points ?? 0;
  return {
    entries,
    balance: formalEnabled ? formalBalance : developmentBalance,
    formalBalance,
    developmentBalance,
    formalEnabled,
    notifications,
  };
}

export async function getAdminPointLedger() {
  const prisma = getPrisma();
  const [entries, commonPoolEntries, commonPoolAggregate, formalPoolAggregate, notifications] =
    await Promise.all([
      prisma.pointLedgerEntry.findMany({
        include: {
          user: { select: { profile: { select: { displayName: true } } } },
          transaction: { select: { item: { select: { title: true } } } },
          reversal: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 300,
      }),
      prisma.commonPoolLedgerEntry.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 200,
      }),
      prisma.commonPoolLedgerEntry.aggregate({ _sum: { points: true } }),
      prisma.commonPoolLedgerEntry.aggregate({
        where: { movement: { isNot: null } },
        _sum: { points: true },
      }),
      prisma.pointExpiryNotification.findMany({
        include: {
          user: { select: { profile: { select: { displayName: true } } } },
          pointEntry: { select: { expiresAt: true, points: true } },
        },
        orderBy: { scheduledFor: "asc" },
        take: 200,
      }),
    ]);
  return {
    entries,
    commonPoolEntries,
    commonPoolBalance: commonPoolAggregate._sum.points ?? 0,
    formalCommonPoolBalance: formalPoolAggregate._sum.points ?? 0,
    notifications,
  };
}
