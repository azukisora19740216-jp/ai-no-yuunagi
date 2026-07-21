import { describe, expect, it } from "vitest";
import { sanitizeLogContext } from "./logger";

describe("sanitizeLogContext", () => {
  it("許可した運用項目だけをログ文脈へ残す", () => {
    const result = sanitizeLogContext({
      requestId: "req-1",
      statusCode: 403,
      email: "person@example.invalid",
      address: "架空の住所",
      token: "secret",
    });

    expect(result).toEqual({ requestId: "req-1", statusCode: 403 });
  });
});
