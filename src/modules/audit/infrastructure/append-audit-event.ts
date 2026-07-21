import type { Prisma } from "@/generated/prisma/client";

type TransactionClient = Prisma.TransactionClient;

export type AuditCommand = {
  actorId?: string;
  actorRole?: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  requestId?: string;
  result?: "SUCCEEDED" | "REJECTED" | "FAILED";
};

export async function appendAuditEvent(
  transaction: TransactionClient,
  command: AuditCommand,
): Promise<void> {
  await transaction.auditEvent.create({
    data: {
      actorType: command.actorId ? "USER" : "SYSTEM",
      actorId: command.actorId,
      actorRole: command.actorRole,
      action: command.action,
      targetType: command.targetType,
      targetId: command.targetId,
      reason: command.reason,
      beforeSafeJson: command.before,
      afterSafeJson: command.after,
      requestId: command.requestId ?? crypto.randomUUID(),
      result: command.result ?? "SUCCEEDED",
    },
  });
}
