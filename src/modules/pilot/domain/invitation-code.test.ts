import { describe, expect, it } from "vitest";
import { generateInvitationCode, hashInvitationCode } from "./invitation-code";

describe("invitation code", () => {
  it("十分な長さの異なるコードを生成し、保存用hashへ変換する", () => {
    const first = generateInvitationCode();
    const second = generateInvitationCode();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(hashInvitationCode(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashInvitationCode(first)).toBe(hashInvitationCode(` ${first} `));
  });
});
