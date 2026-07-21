import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { RoleName, UserStatus } from "@/generated/prisma/enums";
import { auth } from "@/modules/identity/infrastructure/auth";
import { getPrisma } from "@/shared/db/prisma";
import { AppError } from "@/shared/errors/app-error";

export type CurrentActor = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  status: UserStatus;
  roles: RoleName[];
};

export async function getCurrentActor(): Promise<CurrentActor | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const user = await getPrisma().user.findUnique({
    where: { id: session.user.id },
    include: { roles: { select: { role: true } } },
  });
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    status: user.status,
    roles: user.roles.map(({ role }) => role),
  };
}

export async function requireCurrentActor(): Promise<CurrentActor> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.status !== "ACTIVE" && actor.status !== "WARNING") {
    throw new AppError("ACCOUNT_UNAVAILABLE", "このアカウントでは操作できません。", 403);
  }
  return actor;
}
