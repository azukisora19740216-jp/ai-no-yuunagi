import { describe, expect, it, vi } from "vitest";
import { AuditService, type AuditEventWriter } from "./audit-service";

describe("AuditService", () => {
  it("理由付きの安全な監査イベントを追記portへ渡す", async () => {
    const writer: AuditEventWriter = { append: vi.fn().mockResolvedValue(undefined) };
    const service = new AuditService(writer);
    const command = {
      actorType: "staff" as const,
      actorId: "018f2818-39f1-7b5e-a607-cb90e01f17a1",
      actorRole: "moderator",
      action: "listing.reviewed",
      targetType: "listing",
      targetId: "listing-1",
      reason: "禁止品基準の確認結果",
      before: { reviewStatus: "changed" as const },
      after: { reviewStatus: "changed" as const },
      requestId: "req-1",
      result: "succeeded" as const,
    };

    await service.record(command);
    expect(writer.append).toHaveBeenCalledWith(command);
  });

  it("理由のない重要操作を拒否する", async () => {
    const service = new AuditService({ append: vi.fn() });
    await expect(
      service.record({
        actorType: "staff",
        action: "user.suspended",
        targetType: "user",
        targetId: "user-1",
        reason: " ",
        requestId: "req-2",
        result: "rejected",
      }),
    ).rejects.toThrow();
  });
});
