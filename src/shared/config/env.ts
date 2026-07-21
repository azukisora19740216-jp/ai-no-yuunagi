import { z } from "zod";

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url(),
    DATABASE_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(32),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    FEATURE_PILOT_ENROLLMENT: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    FEATURE_KYC_GATES: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    FEATURE_FORMAL_POINTS: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    FEATURE_POINT_EXPIRY: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    FEATURE_POINT_EXPIRY_NOTIFICATIONS: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    NATIONWIDE_PUBLIC_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    ALLOW_MOCK_ADAPTERS: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    EMAIL_DRIVER: z.enum(["mock", "external"]).default("mock"),
    KYC_DRIVER: z.enum(["mock", "disabled", "external"]).default("mock"),
    SHIPPING_DRIVER: z.enum(["mock", "disabled", "external"]).default("mock"),
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    LOCAL_STORAGE_PATH: z.string().min(1).default(".local-data/uploads"),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535),
    MAIL_FROM: z.email(),
  })
  .superRefine((env, context) => {
    if (env.STORAGE_DRIVER === "s3") {
      for (const key of [
        "S3_ENDPOINT",
        "S3_REGION",
        "S3_BUCKET",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
      ] as const) {
        if (!env[key]) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "S3 storage requires this value.",
          });
        }
      }
    }

    if (env.NODE_ENV === "production") {
      if (env.NATIONWIDE_PUBLIC_ENABLED) {
        context.addIssue({
          code: "custom",
          path: ["NATIONWIDE_PUBLIC_ENABLED"],
          message: "Nationwide publication is disabled for the pilot.",
        });
      }
      if (env.ALLOW_MOCK_ADAPTERS) {
        context.addIssue({
          code: "custom",
          path: ["ALLOW_MOCK_ADAPTERS"],
          message: "Mock adapters are forbidden in production.",
        });
      }
      if (
        env.EMAIL_DRIVER === "mock" ||
        env.KYC_DRIVER === "mock" ||
        env.SHIPPING_DRIVER === "mock"
      ) {
        context.addIssue({
          code: "custom",
          path: ["EMAIL_DRIVER"],
          message: "Mock drivers are forbidden in production.",
        });
      }
      if (env.STORAGE_DRIVER === "local") {
        context.addIssue({
          code: "custom",
          path: ["STORAGE_DRIVER"],
          message: "Local storage is forbidden in production.",
        });
      }
      if (env.AUTH_SECRET.includes("local") || env.AUTH_SECRET.includes("change-me")) {
        context.addIssue({
          code: "custom",
          path: ["AUTH_SECRET"],
          message: "A production-specific authentication secret is required.",
        });
      }
      if (env.FEATURE_KYC_GATES && env.KYC_DRIVER !== "external") {
        context.addIssue({
          code: "custom",
          path: ["KYC_DRIVER"],
          message: "Enabled production KYC gates require an external adapter.",
        });
      }
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(input: NodeJS.ProcessEnv): ServerEnv {
  const result = serverEnvSchema.safeParse(input);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join(".")).filter(Boolean);
    throw new Error(`環境変数の設定が不正です: ${[...new Set(fields)].join(", ")}`);
  }
  return result.data;
}

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cachedEnv ??= parseServerEnv(process.env);
  return cachedEnv;
}

export function resetServerEnvForTests(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("テスト環境以外では環境設定キャッシュをリセットできません。");
  }
  cachedEnv = undefined;
}
