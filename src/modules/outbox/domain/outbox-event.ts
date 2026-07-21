import { z } from "zod";

export const outboxEventSchema = z.object({
  topic: z.string().min(1).max(160),
  aggregateType: z.string().min(1).max(120),
  aggregateId: z.string().min(1).max(160),
  idempotencyKey: z.string().min(16).max(200),
  payload: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

export type OutboxEvent = z.infer<typeof outboxEventSchema>;

export function makeOutboxEvent(input: OutboxEvent): OutboxEvent {
  return outboxEventSchema.parse(input);
}
