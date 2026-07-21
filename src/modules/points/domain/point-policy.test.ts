import { describe, expect, it } from "vitest";
import {
  calculateExpiryNoticeAt,
  calculatePointExpiryAt,
  splitAwardByAvailableCapacity,
} from "./point-policy";

describe("point policy", () => {
  it("付与日の1年後が属する月の末日終了後をJST期限にする", () => {
    const expiry = calculatePointExpiryAt(new Date("2026-07-21T03:00:00.000Z"));
    expect(expiry.toISOString()).toBe("2027-07-31T15:00:00.000Z");
  });

  it("うるう日付与でも翌年同月末を期限にする", () => {
    const expiry = calculatePointExpiryAt(new Date("2024-02-29T12:00:00.000Z"));
    expect(expiry.toISOString()).toBe("2025-02-28T15:00:00.000Z");
  });

  it("60・30・7日前の通知予定を計算する", () => {
    const expiry = new Date("2027-07-31T15:00:00.000Z");
    expect(calculateExpiryNoticeAt(expiry, 60).toISOString()).toBe("2027-06-01T15:00:00.000Z");
    expect(calculateExpiryNoticeAt(expiry, 30).toISOString()).toBe("2027-07-01T15:00:00.000Z");
    expect(calculateExpiryNoticeAt(expiry, 7).toISOString()).toBe("2027-07-24T15:00:00.000Z");
  });

  it("30上限を超える部分だけを付与仕訳ごとに分割する", () => {
    expect(
      splitAwardByAvailableCapacity(29, 30, [
        { id: "base", points: 1 },
        { id: "shipping", points: 3 },
      ]),
    ).toEqual([
      { id: "base", points: 1, available: 1, overflow: 0 },
      { id: "shipping", points: 3, available: 0, overflow: 3 },
    ]);
  });
});
