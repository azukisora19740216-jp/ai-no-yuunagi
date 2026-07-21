import type { CurrentActor } from "@/modules/identity/application/current-actor";
import { hasPermission } from "@/modules/identity/domain/authorization";
import { getPrisma } from "@/shared/db/prisma";

const transactionInclude = {
  item: { select: { title: true, deliveryMethod: true, status: true } },
  provider: { select: { profile: { select: { displayName: true } } } },
  recipient: { select: { profile: { select: { displayName: true } } } },
  statusEvents: { orderBy: { createdAt: "asc" as const } },
} as const;

export function listOwnTransactions(userId: string) {
  return getPrisma().transaction.findMany({
    where: { OR: [{ providerUserId: userId }, { recipientUserId: userId }] },
    include: transactionInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export function findAccessibleTransaction(actor: CurrentActor, transactionId: string) {
  const canReadAll = hasPermission(actor.roles, "transaction:read-all");
  return getPrisma().transaction.findFirst({
    where: {
      id: transactionId,
      ...(canReadAll ? {} : { OR: [{ providerUserId: actor.id }, { recipientUserId: actor.id }] }),
    },
    include: transactionInclude,
  });
}

export function listAdminTransactions() {
  return getPrisma().transaction.findMany({
    where: { status: { in: ["UNDER_ADMIN_REVIEW", "DISPUTED", "COMPLETED"] } },
    include: transactionInclude,
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}
