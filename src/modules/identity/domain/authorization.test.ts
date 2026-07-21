import { describe, expect, it } from "vitest";
import { hasPermission, requirePermission } from "./authorization";

describe("authorization", () => {
  it("allows moderators and administrators to review listings", () => {
    expect(hasPermission(["MODERATOR"], "item:review")).toBe(true);
    expect(hasPermission(["ADMINISTRATOR"], "item:review")).toBe(true);
  });

  it("keeps auditors read-only", () => {
    expect(hasPermission(["AUDITOR"], "audit:read")).toBe(true);
    expect(hasPermission(["AUDITOR"], "item:review")).toBe(false);
    expect(hasPermission(["AUDITOR"], "transaction:read-all")).toBe(true);
    expect(hasPermission(["AUDITOR"], "transaction:review")).toBe(false);
    expect(hasPermission(["AUDITOR"], "points:reverse")).toBe(false);
    expect(() => requirePermission(["AUDITOR"], "item:create")).toThrow(/権限/);
  });

  it("limits point reversal and common-pool transfer to administrators", () => {
    expect(hasPermission(["ADMINISTRATOR"], "points:reverse")).toBe(true);
    expect(hasPermission(["ADMINISTRATOR"], "points:common-pool")).toBe(true);
    expect(hasPermission(["MODERATOR"], "points:reverse")).toBe(false);
  });

  it("does not grant listing review to donation reviewers", () => {
    expect(hasPermission(["DONATION_REVIEWER"], "item:review")).toBe(false);
  });
});
