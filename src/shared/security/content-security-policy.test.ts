import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "@/shared/security/content-security-policy";

describe("request-scoped content security policy", () => {
  it("allows only the matching nonce for inline production scripts", () => {
    const policy = buildContentSecurityPolicy("test-nonce", false);
    expect(policy).toContain("script-src 'self' 'nonce-test-nonce' 'strict-dynamic'");
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it("limits unsafe-eval to development tooling", () => {
    expect(buildContentSecurityPolicy("test-nonce", true)).toContain("'unsafe-eval'");
  });
});
