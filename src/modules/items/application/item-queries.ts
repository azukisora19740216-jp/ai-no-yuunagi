import { getPrisma } from "@/shared/db/prisma";

const itemSummaryInclude = {
  category: { select: { name: true } },
  owner: { select: { profile: { select: { displayName: true } } } },
  _count: { select: { requests: true } },
} as const;

export function listPublishedItems() {
  return getPrisma().item.findMany({
    where: { status: "PUBLISHED" },
    include: itemSummaryInclude,
    orderBy: { publishedAt: "desc" },
  });
}

export function findVisibleItem(itemId: string) {
  return getPrisma().item.findFirst({
    where: { id: itemId, status: { in: ["PUBLISHED", "RESERVED"] } },
    include: itemSummaryInclude,
  });
}

export function listOwnItems(userId: string) {
  return getPrisma().item.findMany({
    where: { ownerUserId: userId },
    include: { category: { select: { name: true } }, _count: { select: { requests: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export function findOwnEditableItem(userId: string, itemId: string) {
  return getPrisma().item.findFirst({
    where: { id: itemId, ownerUserId: userId, status: { in: ["DRAFT", "REJECTED"] } },
  });
}

export function listActiveCategories() {
  return getPrisma().category.findMany({ where: { active: true }, orderBy: { name: "asc" } });
}

export function listPendingReviewItems() {
  return getPrisma().item.findMany({
    where: { status: "PENDING_REVIEW" },
    include: { category: true, owner: { select: { profile: true } } },
    orderBy: { updatedAt: "asc" },
  });
}

export function listRequestsForOwnedItem(userId: string, itemId: string) {
  return getPrisma().item.findFirst({
    where: { id: itemId, ownerUserId: userId },
    include: {
      requests: {
        include: { requester: { select: { profile: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}
