import { getPrisma } from "@/shared/db/prisma";

export function findOwnProfile(userId: string) {
  return getPrisma().profile.findUnique({ where: { userId } });
}
