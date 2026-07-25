import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

const validLocalEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "development",
  DEPLOYMENT_ROLE: "local",
  APP_URL: "http://localhost:3000",
  APP_ALLOWED_HOSTS: "localhost",
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
};

const validPreviewEnv: NodeJS.ProcessEnv = {
  ...validLocalEnv,
  NODE_ENV: "production",
  DEPLOYMENT_ROLE: "preview",
  APP_URL: "https://pr-14.preview.prisma.build",
  APP_ALLOWED_HOSTS: "pr-14.preview.prisma.build",
  AUTH_SECRET: "preview-authentication-secret-at-least-32-characters",
  ALLOW_MOCK_ADAPTERS: "false",
  EMAIL_DRIVER: "disabled",
  KYC_DRIVER: "disabled",
  SHIPPING_DRIVER: "disabled",
  STORAGE_DRIVER: "disabled",
};

const validProductionEnv: NodeJS.ProcessEnv = {
  ...validPreviewEnv,
  DEPLOYMENT_ROLE: "production",
  APP_URL: "https://service.example.jp",
  APP_ALLOWED_HOSTS: "service.example.jp",
  AUTH_SECRET: "production-authentication-secret-at-least-32-characters",
  EMAIL_DRIVER: "external",
  KYC_DRIVER: "external",
  SHIPPING_DRIVER: "external",
  STORAGE_DRIVER: "s3",
  SMTP_HOST: "smtp.example.jp",
  SMTP_PORT: "587",
  MAIL_FROM: "no-reply@example.jp",
  S3_ENDPOINT: "https://objects.example.jp",
  S3_REGION: "ap-northeast-1",
  S3_BUCKET: "production-bucket",
  S3_ACCESS_KEY_ID: "production-access-key",
  S3_SECRET_ACCESS_KEY: "production-secret-key",
};

describe("parseServerEnv", () => {
  it("localで明示的に有効化したmockとlocal storageを受け入れる", () => {
    const parsed = parseServerEnv(validLocalEnv);
    expect(parsed.DEPLOYMENT_ROLE).toBe("local");
    expect(parsed.ALLOW_MOCK_ADAPTERS).toBe(true);
    expect(parsed.EMAIL_DRIVER).toBe("mock");
    expect(parsed.STORAGE_DRIVER).toBe("local");
  });

  it("preview + email disabledで起動設定を受け入れる", () => {
    expect(parseServerEnv(validPreviewEnv).EMAIL_DRIVER).toBe("disabled");
  });

  it("preview + storage disabledで起動設定を受け入れる", () => {
    expect(parseServerEnv(validPreviewEnv).STORAGE_DRIVER).toBe("disabled");
  });

  it("preview + mock emailを拒否する", () => {
    expect(() => parseServerEnv({ ...validPreviewEnv, EMAIL_DRIVER: "mock" })).toThrow(
      /EMAIL_DRIVER/,
    );
  });

  it("preview + local storageを拒否する", () => {
    expect(() => parseServerEnv({ ...validPreviewEnv, STORAGE_DRIVER: "local" })).toThrow(
      /STORAGE_DRIVER/,
    );
  });

  it("production + disabled emailを拒否する", () => {
    expect(() => parseServerEnv({ ...validProductionEnv, EMAIL_DRIVER: "disabled" })).toThrow(
      /EMAIL_DRIVER/,
    );
  });

  it("production + mock emailを拒否する", () => {
    expect(() => parseServerEnv({ ...validProductionEnv, EMAIL_DRIVER: "mock" })).toThrow(
      /EMAIL_DRIVER/,
    );
  });

  it("production + disabled storageを拒否する", () => {
    expect(() => parseServerEnv({ ...validProductionEnv, STORAGE_DRIVER: "disabled" })).toThrow(
      /STORAGE_DRIVER/,
    );
  });

  it("production + local storageを拒否する", () => {
    expect(() => parseServerEnv({ ...validProductionEnv, STORAGE_DRIVER: "local" })).toThrow(
      /STORAGE_DRIVER/,
    );
  });

  it("production + mock KYCを拒否する", () => {
    expect(() => parseServerEnv({ ...validProductionEnv, KYC_DRIVER: "mock" })).toThrow(
      /KYC_DRIVER/,
    );
  });

  it("productionの外部adapter設定を受け入れる", () => {
    expect(parseServerEnv(validProductionEnv).DEPLOYMENT_ROLE).toBe("production");
  });

  it("external emailでSMTP設定が不足する場合は拒否する", () => {
    expect(() =>
      parseServerEnv({
        ...validProductionEnv,
        SMTP_HOST: undefined,
        SMTP_PORT: undefined,
        MAIL_FROM: undefined,
      }),
    ).toThrow(/SMTP_HOST|SMTP_PORT|MAIL_FROM/);
  });

  it("s3 storageで設定が不足する場合は拒否し、値をエラーへ含めない", () => {
    const input = {
      ...validProductionEnv,
      S3_ENDPOINT: undefined,
      S3_ACCESS_KEY_ID: "sensitive-access-key",
    };
    expect(() => parseServerEnv(input)).toThrow(/S3_ENDPOINT/);

    try {
      parseServerEnv(input);
    } catch (error) {
      expect(String(error)).not.toContain("sensitive-access-key");
    }
  });

  it("未許可のAPP_URLを拒否する", () => {
    expect(() =>
      parseServerEnv({
        ...validPreviewEnv,
        APP_URL: "https://other.preview.prisma.build",
      }),
    ).toThrow(/APP_ALLOWED_HOSTS/);
  });

  it("wildcardのAPP_ALLOWED_HOSTSを拒否する", () => {
    expect(() =>
      parseServerEnv({
        ...validPreviewEnv,
        APP_ALLOWED_HOSTS: "*.prisma.build",
      }),
    ).toThrow(/APP_ALLOWED_HOSTS/);
  });

  it("productionの未確定APP_URLを拒否する", () => {
    expect(() =>
      parseServerEnv({
        ...validProductionEnv,
        APP_URL: "https://service.invalid",
        APP_ALLOWED_HOSTS: "service.invalid",
      }),
    ).toThrow(/APP_URL/);
  });

  it("previewとproductionをNODE_ENVだけで判定しない", () => {
    expect(() =>
      parseServerEnv({
        ...validLocalEnv,
        NODE_ENV: "production",
        DEPLOYMENT_ROLE: "local",
      }),
    ).not.toThrow();
  });

  it("pilotで全国公開を有効にしたpreview設定を拒否する", () => {
    expect(() =>
      parseServerEnv({
        ...validPreviewEnv,
        NATIONWIDE_PUBLIC_ENABLED: "true",
      }),
    ).toThrow(/NATIONWIDE_PUBLIC_ENABLED/);
  });
});
