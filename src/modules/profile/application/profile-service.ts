import { z } from "zod";
import { requirePermission } from "@/modules/identity/domain/authorization";
import type { CurrentActor } from "@/modules/identity/application/current-actor";
import { appendAuditEvent } from "@/modules/audit/infrastructure/append-audit-event";
import { getPrisma } from "@/shared/db/prisma";

export const profileInputSchema = z.object({
  displayName: z.string().trim().min(1, "表示名を入力してください。").max(50),
  bio: z.string().trim().max(500, "自己紹介は500文字以内で入力してください。").optional(),
  handoverArea: z
    .string()
    .trim()
    .max(100, "受渡し地域は100文字以内で入力してください。")
    .optional(),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

export async function updateOwnProfile(actor: CurrentActor, rawInput: ProfileInput) {
  requirePermission(actor.roles, "profile:update-own");
  const input = profileInputSchema.parse(rawInput);

  return getPrisma().$transaction(async (transaction) => {
    const before = await transaction.profile.findUnique({ where: { userId: actor.id } });
    const profile = await transaction.profile.upsert({
      where: { userId: actor.id },
      update: {
        displayName: input.displayName,
        bio: input.bio || null,
        handoverArea: input.handoverArea || null,
      },
      create: {
        userId: actor.id,
        displayName: input.displayName,
        bio: input.bio || null,
        handoverArea: input.handoverArea || null,
      },
    });
    await transaction.user.update({ where: { id: actor.id }, data: { name: input.displayName } });
    await appendAuditEvent(transaction, {
      actorId: actor.id,
      actorRole: actor.roles.join(","),
      action: "profile.updated",
      targetType: "profile",
      targetId: profile.id,
      reason: "本人によるプロフィール更新",
      before: before
        ? {
            displayName: before.displayName,
            hasBio: Boolean(before.bio),
            hasHandoverArea: Boolean(before.handoverArea),
          }
        : undefined,
      after: {
        displayName: profile.displayName,
        hasBio: Boolean(profile.bio),
        hasHandoverArea: Boolean(profile.handoverArea),
      },
    });
    return profile;
  });
}
