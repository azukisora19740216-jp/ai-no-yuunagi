import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

const validDevelopmentEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "development",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://user:password@localhost:5432/test",
  AUTH_SECRET: "test-only-authentication-secret-32-characters",
  LOG_LEVEL: "info",
  FEATURE_PILOT_ENROLLMENT: "false",
  FEATURE_KYC_GATES: "false",
  FEATURE_FORMAL_POINTS: "false",
  FEATURE_POINT_EXPIRY: "false",
  FEATURE_POINT_EXPIRY_NOTIFICATIONS: "false",
  NATIONWIDE_PUBLIC_ENABLED: "false",
  ALLOW_MOCK_ADAPTERS: "true",
  EMAIL_DRIVER: "mock",
  KYC_DRIVER: "mock",
  SHIPPING_DRIVER: "mock",
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_PATH: ".local-data/uploads",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  MAIL_FROM: "no-reply@example.invalid",
};

describe("parseServerEnv", () => {
  it("開発環境の安全なモック設定を受け入れる", () => {
    const parsed = parseServerEnv(validDevelopmentEnv);
    expect(parsed.ALLOW_MOCK_ADAPTERS).toBe(true);
    expect(parsed.FEATURE_PILOT_ENROLLMENT).toBe(false);
    expect(parsed.NATIONWIDE_PUBLIC_ENABLED).toBe(false);
    expect(parsed.SMTP_PORT).toBe(1025);
  });

  it("実証中の本番全国公開設定を拒否する", () => {
    expect(() =>
      parseServerEnv({
        ...validDevelopmentEnv,
        NODE_ENV: "production",
        NATIONWIDE_PUBLIC_ENABLED: "true",
      }),
    ).toThrow(/NATIONWIDE_PUBLIC_ENABLED/);
  });

  it("本番環境のモックとローカル保存を拒否する", () => {
    expect(() => parseServerEnv({ ...validDevelopmentEnv, NODE_ENV: "production" })).toThrow(
      /ALLOW_MOCK_ADAPTERS|KYC_DRIVER|STORAGE_DRIVER/,
    );
  });

  it("S3設定値の不足を拒否し、値自体をエラーへ含めない", () => {
    expect(() =>
      parseServerEnv({
        ...validDevelopmentEnv,
        STORAGE_DRIVER: "s3",
        S3_ACCESS_KEY_ID: "sensitive-access-key",
      }),
    ).toThrow(/S3_ENDPOINT/);

    try {
      parseServerEnv({
        ...validDevelopmentEnv,
        STORAGE_DRIVER: "s3",
        S3_ACCESS_KEY_ID: "sensitive-access-key",
      });
    } catch (error) {
      expect(String(error)).not.toContain("sensitive-access-key");
    }
  });
});
