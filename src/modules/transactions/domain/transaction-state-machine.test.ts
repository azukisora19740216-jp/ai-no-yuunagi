import { describe, expect, it } from "vitest";
import { nextTransactionStatus } from "./transaction-state-machine";

describe("transaction state machine", () => {
  it("requires recipient acceptance before scheduling", () => {
    expect(nextTransactionStatus("RECIPIENT_SELECTED", "ACCEPT_RECIPIENT_SELECTION")).toBe(
      "ACCEPTED",
    );
    expect(nextTransactionStatus("ACCEPTED", "SCHEDULE_HANDOVER")).toBe("HANDOVER_SCHEDULED");
    expect(() => nextTransactionStatus("RECIPIENT_SELECTED", "SCHEDULE_HANDOVER")).toThrow(
      /現在の取引状態/,
    );
  });

  it("moves to admin review only after both reports", () => {
    expect(nextTransactionStatus("HANDOVER_SCHEDULED", "REPORT_PROVIDER_COMPLETE")).toBe(
      "PROVIDER_REPORTED_COMPLETE",
    );
    expect(nextTransactionStatus("PROVIDER_REPORTED_COMPLETE", "REPORT_RECIPIENT_COMPLETE")).toBe(
      "UNDER_ADMIN_REVIEW",
    );
    expect(() =>
      nextTransactionStatus("PROVIDER_REPORTED_COMPLETE", "REPORT_PROVIDER_COMPLETE"),
    ).toThrow(/現在の取引状態/);
  });

  it("rejects approval before both reports and re-approval after completion", () => {
    expect(() => nextTransactionStatus("HANDOVER_SCHEDULED", "ADMIN_APPROVE")).toThrow(
      /現在の取引状態/,
    );
    expect(nextTransactionStatus("UNDER_ADMIN_REVIEW", "ADMIN_APPROVE")).toBe("COMPLETED");
    expect(() => nextTransactionStatus("COMPLETED", "ADMIN_APPROVE")).toThrow(/現在の取引状態/);
  });

  it("allows held transactions to be approved or cancelled", () => {
    expect(nextTransactionStatus("UNDER_ADMIN_REVIEW", "ADMIN_HOLD")).toBe("DISPUTED");
    expect(nextTransactionStatus("DISPUTED", "ADMIN_APPROVE")).toBe("COMPLETED");
    expect(nextTransactionStatus("DISPUTED", "ADMIN_CANCEL")).toBe("CANCELLED");
  });
});
