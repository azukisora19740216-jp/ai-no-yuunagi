import { AppError } from "@/shared/errors/app-error";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function calculatePointExpiryAt(awardedAt: Date, expiryMonths = 12): Date {
  if (!Number.isInteger(expiryMonths) || expiryMonths <= 0) {
    throw new AppError("POINT_EXPIRY_POLICY_INVALID", "ポイント期限設定が不正です。", 500);
  }
  const jst = new Date(awardedAt.getTime() + JST_OFFSET_MS);
  const baseMonth = jst.getUTCFullYear() * 12 + jst.getUTCMonth() + expiryMonths;
  const targetYear = Math.floor(baseMonth / 12);
  const targetMonth = baseMonth % 12;
  return new Date(Date.UTC(targetYear, targetMonth + 1, 1) - JST_OFFSET_MS);
}

export function calculateExpiryNoticeAt(expiresAt: Date, noticeDays: 60 | 30 | 7): Date {
  return new Date(expiresAt.getTime() - noticeDays * 24 * 60 * 60 * 1000);
}

export function splitAwardByAvailableCapacity<T extends { id: string; points: number }>(
  currentBalance: number,
  cap: number,
  awards: readonly T[],
) {
  let capacity = Math.max(0, cap - currentBalance);
  return awards.map((award) => {
    const available = Math.min(capacity, award.points);
    capacity -= available;
    return { ...award, available, overflow: award.points - available };
  });
}
