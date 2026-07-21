import { createHash, randomBytes } from "node:crypto";

export function generateInvitationCode(): string {
  return randomBytes(24).toString("base64url");
}

export function hashInvitationCode(code: string): string {
  return createHash("sha256").update(code.trim(), "utf8").digest("hex");
}
