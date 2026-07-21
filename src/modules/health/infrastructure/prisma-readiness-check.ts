import type { ReadinessCheck } from "../domain/readiness-check";
import { getPrisma } from "@/shared/db/prisma";

export class PrismaReadinessCheck implements ReadinessCheck {
  async verify(): Promise<void> {
    await getPrisma().$queryRaw`SELECT 1`;
  }
}
