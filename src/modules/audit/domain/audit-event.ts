import { z } from "zod";

const changeMarkerSchema = z.enum(["added", "changed", "removed"]);

export const auditEventSchema = z.object({
  actorType: z.enum(["user", "staff", "system"]),
  actorId: z.uuid().optional(),
  actorRole: z.string().min(1).max(80).optional(),
  action: z.string().min(1).max(120),
  targetType: z.string().min(1).max(120),
  targetId: z.string().min(1).max(160),
  reason: z.string().trim().min(1).max(1_000),
  before: z.record(z.string(), changeMarkerSchema).optional(),
  after: z.record(z.string(), changeMarkerSchema).optional(),
  requestId: z.string().min(1).max(160),
  result: z.enum(["succeeded", "rejected", "failed"]),
});

export type AuditEventCommand = z.infer<typeof auditEventSchema>;
