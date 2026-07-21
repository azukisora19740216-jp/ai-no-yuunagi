import { auditEventSchema, type AuditEventCommand } from "../domain/audit-event";

export interface AuditEventWriter {
  append(event: AuditEventCommand): Promise<void>;
}

export class AuditService {
  constructor(private readonly writer: AuditEventWriter) {}

  async record(command: AuditEventCommand): Promise<void> {
    const event = auditEventSchema.parse(command);
    await this.writer.append(event);
  }
}
