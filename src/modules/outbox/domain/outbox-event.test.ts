import { describe, expect, it } from "vitest";
import { makeOutboxEvent } from "./outbox-event";

describe("makeOutboxEvent", () => {
  it("冪等キー付きの安全なイベントを作成する", () => {
    const event = makeOutboxEvent({
      topic: "audit.recorded",
      aggregateType: "audit_event",
      aggregateId: "audit-1",
      idempotencyKey: "audit.recorded:audit-1",
      payload: { auditEventId: "audit-1" },
    });
    expect(event.idempotencyKey).toBe("audit.recorded:audit-1");
  });

  it("短すぎる冪等キーを拒否する", () => {
    expect(() =>
      makeOutboxEvent({
        topic: "test",
        aggregateType: "test",
        aggregateId: "1",
        idempotencyKey: "short",
        payload: {},
      }),
    ).toThrow();
  });
});
