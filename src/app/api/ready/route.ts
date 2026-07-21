import { NextResponse } from "next/server";
import { checkReadiness } from "@/modules/health/application/check-readiness";
import { PrismaReadinessCheck } from "@/modules/health/infrastructure/prisma-readiness-check";
import { appLogger } from "@/shared/observability/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = crypto.randomUUID();
  const result = await checkReadiness(new PrismaReadinessCheck());

  if (result.status === "unavailable") {
    appLogger.warn("readiness_check_failed", {
      requestId,
      route: "/api/ready",
      statusCode: 503,
      errorCode: result.errorCode,
    });
  }

  return NextResponse.json(result.body, {
    status: result.status === "ready" ? 200 : 503,
    headers: { "x-request-id": requestId },
  });
}
