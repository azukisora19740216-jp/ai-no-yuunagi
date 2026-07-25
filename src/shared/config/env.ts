import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalPort = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().int().min(1).max(65_535).optional(),
);

const optionalEmail = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.email().optional(),
);

const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.url().optional());

const PRISMA_PREVIEW_HOST_PATTERN = "*.prisma.build";

function isNonPublicHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".invalid") ||
    normalized.endsWith(".test") ||
    normalized.endsWith(".example")
  );
}

function isAllowedPrismaPreviewHost(host: string) {
  return (
    host === PRISMA_PREVIEW_HOST_PATTERN ||
    (host.endsWith(".prisma.build") && host !== "prisma.build" && !host.includes("*"))
  );
}

function matchesAllowedHost(hostname: string, allowedHost: string) {
  return (
    hostname === allowedHost ||
    (allowedHost === PRISMA_PREVIEW_HOST_PATTERN &&
      hostname.endsWith(".prisma.build") &&
      hostname !== "prisma.build")
  );
}

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DEPLOYMENT_ROLE: z.enum(["local", "test", "preview", "production"]).default("local"),
    APP_URL: optionalUrl,
    APP_ALLOWED_HOSTS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((host) => host.trim().toLowerCase())
          .filter(Boolean),
      ),
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
    EMAIL_DRIVER: z.enum(["mock", "disabled", "external"]).default("mock"),
    KYC_DRIVER: z.enum(["mock", "disabled", "external"]).default("mock"),
    SHIPPING_DRIVER: z.enum(["mock", "disabled", "external"]).default("mock"),
    STORAGE_DRIVER: z.enum(["local", "disabled", "s3"]).default("local"),
    LOCAL_STORAGE_PATH: z.string().min(1).default(".local-data/uploads"),
    S3_ENDPOINT: optionalNonEmptyString,
    S3_REGION: optionalNonEmptyString,
    S3_BUCKET: optionalNonEmptyString,
    S3_ACCESS_KEY_ID: optionalNonEmptyString,
    S3_SECRET_ACCESS_KEY: optionalNonEmptyString,
    SMTP_HOST: optionalNonEmptyString,
    SMTP_PORT: optionalPort,
    MAIL_FROM: optionalEmail,
    AUTH_RATE_LIMIT_WINDOW: z.coerce.number().int().min(1).default(60),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  })
  .superRefine((env, context) => {
    const appUrl = env.APP_URL ? new URL(env.APP_URL) : undefined;
    const isDeployedRole =
      env.DEPLOYMENT_ROLE === "preview" || env.DEPLOYMENT_ROLE === "production";
    const isMockRole = env.DEPLOYMENT_ROLE === "local" || env.DEPLOYMENT_ROLE === "test";

    if (!appUrl && env.DEPLOYMENT_ROLE !== "preview") {
      context.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "APP_URL is required outside dynamic preview deployments.",
      });
    }

    if (
      appUrl &&
      (appUrl.pathname !== "/" ||
        appUrl.search !== "" ||
        appUrl.hash !== "" ||
        appUrl.username !== "" ||
        appUrl.password !== "")
    ) {
      context.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message: "APP_URL must be an origin without credentials, path, query, or fragment.",
      });
    }

    if (env.APP_ALLOWED_HOSTS.some((host) => host.includes("://"))) {
      context.addIssue({
        code: "custom",
        path: ["APP_ALLOWED_HOSTS"],
        message: "Allowed hosts must not include a scheme.",
      });
    }

    if (isDeployedRole) {
      if (env.NODE_ENV !== "production") {
        context.addIssue({
          code: "custom",
          path: ["NODE_ENV"],
          message: "Preview and production roles require the production runtime mode.",
        });
      }
      if (appUrl && appUrl.protocol !== "https:") {
        context.addIssue({
          code: "custom",
          path: ["APP_URL"],
          message: "Deployed APP_URL must use HTTPS.",
        });
      }
      if (appUrl && isNonPublicHostname(appUrl.hostname)) {
        context.addIssue({
          code: "custom",
          path: ["APP_URL"],
          message: "Deployed APP_URL must be a confirmed public hostname.",
        });
      }
      if (
        appUrl &&
        !env.APP_ALLOWED_HOSTS.some((host) =>
          matchesAllowedHost(appUrl.hostname.toLowerCase(), host),
        )
      ) {
        context.addIssue({
          code: "custom",
          path: ["APP_ALLOWED_HOSTS"],
          message: "APP_URL hostname must be explicitly allowlisted.",
        });
      }
      if (
        env.DEPLOYMENT_ROLE === "preview" &&
        env.APP_ALLOWED_HOSTS.some((host) => !isAllowedPrismaPreviewHost(host))
      ) {
        context.addIssue({
          code: "custom",
          path: ["APP_ALLOWED_HOSTS"],
          message: "Preview allows only bounded Prisma Compute hostnames.",
        });
      }
      if (env.ALLOW_MOCK_ADAPTERS) {
        context.addIssue({
          code: "custom",
          path: ["ALLOW_MOCK_ADAPTERS"],
          message: "Mock adapters are forbidden in deployed roles.",
        });
      }
      for (const key of ["EMAIL_DRIVER", "KYC_DRIVER", "SHIPPING_DRIVER"] as const) {
        if (env[key] === "mock") {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Mock drivers are forbidden in deployed roles.",
          });
        }
      }
      if (env.STORAGE_DRIVER === "local") {
        context.addIssue({
          code: "custom",
          path: ["STORAGE_DRIVER"],
          message: "Local storage is forbidden in deployed roles.",
        });
      }
      if (env.NATIONWIDE_PUBLIC_ENABLED) {
        context.addIssue({
          code: "custom",
          path: ["NATIONWIDE_PUBLIC_ENABLED"],
          message: "Nationwide publication is disabled for the pilot.",
        });
      }
    }

    if (!isMockRole && env.ALLOW_MOCK_ADAPTERS) {
      context.addIssue({
        code: "custom",
        path: ["ALLOW_MOCK_ADAPTERS"],
        message: "Mock adapters are limited to local and test roles.",
      });
    }

    if (env.EMAIL_DRIVER === "mock" && (!isMockRole || !env.ALLOW_MOCK_ADAPTERS)) {
      context.addIssue({
        code: "custom",
        path: ["EMAIL_DRIVER"],
        message: "Mock email is limited to explicitly enabled local and test roles.",
      });
    }

    if (env.STORAGE_DRIVER === "local" && !isMockRole) {
      context.addIssue({
        code: "custom",
        path: ["STORAGE_DRIVER"],
        message: "Local storage is limited to local and test roles.",
      });
    }

    if (env.EMAIL_DRIVER === "external") {
      for (const key of ["SMTP_HOST", "SMTP_PORT", "MAIL_FROM"] as const) {
        if (!env[key]) {
          context.addIssue({
            code: "custom",
            path: [key],
            message: "External email requires this value.",
          });
        }
      }
    }

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

    if (env.DEPLOYMENT_ROLE === "production") {
      if (env.APP_ALLOWED_HOSTS.some((host) => host.includes("*"))) {
        context.addIssue({
          code: "custom",
          path: ["APP_ALLOWED_HOSTS"],
          message: "Production allowed hosts must be exact hostnames.",
        });
      }
      if (env.EMAIL_DRIVER !== "external") {
        context.addIssue({
          code: "custom",
          path: ["EMAIL_DRIVER"],
          message: "Production requires an external email adapter.",
        });
      }
      if (env.STORAGE_DRIVER !== "s3") {
        context.addIssue({
          code: "custom",
          path: ["STORAGE_DRIVER"],
          message: "Production requires an S3-compatible storage adapter.",
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
  if (result.data.DEPLOYMENT_ROLE === "preview" && result.data.APP_ALLOWED_HOSTS.length === 0) {
    return { ...result.data, APP_ALLOWED_HOSTS: [PRISMA_PREVIEW_HOST_PATTERN] };
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
