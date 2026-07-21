import { describe, expect, it } from "vitest";
import { AppError, toSafeErrorBody } from "./app-error";

describe("toSafeErrorBody", () => {
  it("想定済みエラーは安全な日本語メッセージを返す", () => {
    const body = toSafeErrorBody(
      new AppError("INVALID_STATE", "現在の状態では操作できません。", 409),
      "req-1",
    );
    expect(body.error).toEqual({
      code: "INVALID_STATE",
      message: "現在の状態では操作できません。",
      requestId: "req-1",
    });
  });

  it("内部例外の詳細を公開しない", () => {
    const body = toSafeErrorBody(new Error("password=secret SQL failed"), "req-2");
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});
