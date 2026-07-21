import type { KycStatus } from "@/generated/prisma/enums";

export type KycDecision = {
  provider: string;
  status: KycStatus;
  subjectReference?: string;
  validUntil?: Date;
  reasonCode?: string;
};

export interface KycAdapter {
  readonly provider: string;
  decide(input: Omit<KycDecision, "provider">): Promise<KycDecision>;
}
