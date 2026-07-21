import { afterEach, describe, expect, it } from "vitest";
import { mockKycAdapter } from "@/modules/pilot/infrastructure/mock-kyc-adapter";
import { resetServerEnvForTests } from "@/shared/config/env";

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
  resetServerEnvForTests();
});

describe("mock KYC adapter", () => {
  it("returns only a normalized development decision when explicitly enabled", async () => {
    Object.assign(process.env, {
      APP_URL: "http://localhost:3000",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      AUTH_SECRET: "test-only-auth-secret-at-least-32-characters",
      SMTP_HOST: "localhost",
      SMTP_PORT: "1025",
      MAIL_FROM: "test@example.invalid",
    });
    process.env.ALLOW_MOCK_ADAPTERS = "true";
    process.env.KYC_DRIVER = "mock";
    resetServerEnvForTests();
    await expect(mockKycAdapter.decide({ status: "PENDING" })).resolves.toMatchObject({
      provider: "mock",
      status: "PENDING",
    });
  });

  it("fails closed when the mock is not explicitly enabled", async () => {
    Object.assign(process.env, {
      APP_URL: "http://localhost:3000",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      AUTH_SECRET: "test-only-auth-secret-at-least-32-characters",
      SMTP_HOST: "localhost",
      SMTP_PORT: "1025",
      MAIL_FROM: "test@example.invalid",
    });
    process.env.ALLOW_MOCK_ADAPTERS = "false";
    process.env.KYC_DRIVER = "disabled";
    resetServerEnvForTests();
    await expect(mockKycAdapter.decide({ status: "PENDING" })).rejects.toMatchObject({
      code: "MOCK_KYC_FORBIDDEN",
    });
  });
});
