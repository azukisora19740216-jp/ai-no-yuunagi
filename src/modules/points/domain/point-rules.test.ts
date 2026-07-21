import { describe, expect, it } from "vitest";
import { calculatePointAward, calculatePostedBalance } from "./point-rules";

describe("Okagesama point rules", () => {
  it.each([
    ["NONE", 1],
    ["SIMPLE", 2],
    ["STANDARD", 3],
    ["LARGE_SPECIAL", 4],
  ] as const)(
    "maps shipping workload %s to total %i without any monetary value",
    (level, total) => {
      expect(calculatePointAward("SHIPPING", level)).toEqual({
        basePoints: 1,
        shippingBonus: total - 1,
        totalPoints: total,
      });
    },
  );

  it("rejects shipping bonus for handover", () => {
    expect(calculatePointAward("HANDOVER", "NONE").totalPoints).toBe(1);
    expect(() => calculatePointAward("HANDOVER", "SIMPLE")).toThrow(/対面手渡し/);
  });

  it("derives balance from posted entries and ignores held entries", () => {
    expect(
      calculatePostedBalance([
        { points: 1, status: "POSTED" },
        { points: 3, status: "HELD" },
        { points: -1, status: "POSTED" },
      ]),
    ).toBe(0);
  });
});
