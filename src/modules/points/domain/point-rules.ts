import type { DeliveryMethod, ShippingWorkloadLevel } from "@/generated/prisma/enums";
import { AppError } from "@/shared/errors/app-error";

export const shippingWorkloadPoints: Record<ShippingWorkloadLevel, number> = {
  NONE: 0,
  SIMPLE: 1,
  STANDARD: 2,
  LARGE_SPECIAL: 3,
};

export function calculatePointAward(
  deliveryMethod: DeliveryMethod,
  workloadLevel: ShippingWorkloadLevel,
) {
  const shippingBonus = shippingWorkloadPoints[workloadLevel];
  if (deliveryMethod === "HANDOVER" && shippingBonus !== 0) {
    throw new AppError(
      "SHIPPING_BONUS_NOT_ALLOWED",
      "対面手渡しの取引には配送協力加算を設定できません。",
      409,
    );
  }
  return { basePoints: 1, shippingBonus, totalPoints: 1 + shippingBonus };
}

export function calculatePostedBalance(
  entries: readonly { points: number; status: "POSTED" | "HELD" }[],
): number {
  return entries.reduce(
    (total, entry) => total + (entry.status === "POSTED" ? entry.points : 0),
    0,
  );
}
