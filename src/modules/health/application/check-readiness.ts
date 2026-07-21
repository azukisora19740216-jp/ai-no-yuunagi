import type { ReadinessCheck } from "../domain/readiness-check";

type ReadyResult = {
  status: "ready";
  body: { status: "ready"; checks: { database: "ok" } };
};

type UnavailableResult = {
  status: "unavailable";
  errorCode: "DATABASE_UNAVAILABLE";
  body: {
    status: "unavailable";
    checks: { database: "unavailable" };
    message: "現在サービスを準備できません。時間をおいて再度お試しください。";
  };
};

export async function checkReadiness(
  database: ReadinessCheck,
): Promise<ReadyResult | UnavailableResult> {
  try {
    await database.verify();
    return {
      status: "ready",
      body: { status: "ready", checks: { database: "ok" } },
    };
  } catch {
    return {
      status: "unavailable",
      errorCode: "DATABASE_UNAVAILABLE",
      body: {
        status: "unavailable",
        checks: { database: "unavailable" },
        message: "現在サービスを準備できません。時間をおいて再度お試しください。",
      },
    };
  }
}
