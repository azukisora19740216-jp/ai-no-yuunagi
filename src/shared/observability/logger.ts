import pino from "pino";

export type SafeLogContext = {
  requestId?: string;
  route?: string;
  statusCode?: number;
  durationMs?: number;
  errorCode?: string;
  jobId?: string;
  targetType?: string;
  targetId?: string;
};

const safeContextKeys = [
  "requestId",
  "route",
  "statusCode",
  "durationMs",
  "errorCode",
  "jobId",
  "targetType",
  "targetId",
] as const;

export function sanitizeLogContext(input: Record<string, unknown>): SafeLogContext {
  const output: Record<string, unknown> = {};
  for (const key of safeContextKeys) {
    if (input[key] !== undefined) output[key] = input[key];
  }
  return output as SafeLogContext;
}

const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "ai-no-yuunagi" },
  redact: {
    paths: [
      "email",
      "address",
      "phone",
      "password",
      "token",
      "cookie",
      "authorization",
      "trackingNumber",
      "messageBody",
    ],
    censor: "[REDACTED]",
  },
});

export const appLogger = {
  info(event: string, context: SafeLogContext = {}) {
    baseLogger.info(sanitizeLogContext(context), event);
  },
  warn(event: string, context: SafeLogContext = {}) {
    baseLogger.warn(sanitizeLogContext(context), event);
  },
  error(event: string, context: SafeLogContext = {}) {
    baseLogger.error(sanitizeLogContext(context), event);
  },
};
