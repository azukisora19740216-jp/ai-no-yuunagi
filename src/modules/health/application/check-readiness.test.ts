import { describe, expect, it, vi } from "vitest";
import { checkReadiness } from "./check-readiness";

describe("checkReadiness", () => {
  it("DB疎通成功時にreadyを返す", async () => {
    const result = await checkReadiness({ verify: vi.fn().mockResolvedValue(undefined) });
    expect(result.status).toBe("ready");
  });

  it("DB例外の内部詳細を公開しない", async () => {
    const result = await checkReadiness({
      verify: vi.fn().mockRejectedValue(new Error("postgresql://secret@db")),
    });
    expect(result.status).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
