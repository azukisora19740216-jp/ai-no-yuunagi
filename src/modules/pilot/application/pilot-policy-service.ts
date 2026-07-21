import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getServerEnv } from "@/shared/config/env";
import { getPrisma } from "@/shared/db/prisma";
import { AppError } from "@/shared/errors/app-error";

type PolicyDb = Pick<
  Prisma.TransactionClient,
  "servicePolicyVersion" | "pilotMembership" | "consentRecord" | "kycCase" | "user"
>;

export type ActivePilotContext = {
  policyId: string;
  policyVersion: string;
  termsVersion: string;
  privacyVersion: string;
  regionLabel: string;
  allowedAreaKeys: string[];
  registrationLimit: number;
  inviteOnly: boolean;
  nationwidePublicEnabled: boolean;
};

function parseAreaKeys(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new AppError(
      "PILOT_AREA_CONFIG_INVALID",
      "対象地域の設定が未完了のため、現在この操作を利用できません。",
      503,
    );
  }
  return value as string[];
}

export async function getActivePilotContext(
  db: PolicyDb = getPrisma() as unknown as PolicyDb,
  now = new Date(),
): Promise<ActivePilotContext> {
  const policy = await db.servicePolicyVersion.findFirst({
    where: { status: "APPROVED", effectiveFrom: { lte: now } },
    include: { pilotSetting: true },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
  const pilot = policy?.pilotSetting;
  if (
    !policy ||
    !pilot ||
    pilot.effectiveFrom > now ||
    (pilot.effectiveTo !== null && pilot.effectiveTo <= now) ||
    !pilot.inviteOnly ||
    pilot.nationwidePublicEnabled ||
    getServerEnv().NATIONWIDE_PUBLIC_ENABLED
  ) {
    throw new AppError(
      "PILOT_POLICY_NOT_READY",
      "実証運用の設定が未完了のため、現在この操作を利用できません。",
      503,
    );
  }
  const allowedAreaKeys = parseAreaKeys(pilot.allowedAreaKeys);
  if (allowedAreaKeys.length === 0) {
    throw new AppError(
      "PILOT_AREA_NOT_CONFIGURED",
      "対象地域の設定が未完了のため、現在この操作を利用できません。",
      503,
    );
  }
  return {
    policyId: policy.id,
    policyVersion: policy.version,
    termsVersion: policy.termsVersion,
    privacyVersion: policy.privacyVersion,
    regionLabel: pilot.regionLabel,
    allowedAreaKeys,
    registrationLimit: pilot.registrationLimit,
    inviteOnly: pilot.inviteOnly,
    nationwidePublicEnabled: pilot.nationwidePublicEnabled,
  };
}

export async function getPublicPilotRegistrationContext() {
  if (!getServerEnv().FEATURE_PILOT_ENROLLMENT) return { enabled: false as const };
  try {
    const context = await getActivePilotContext();
    return { enabled: true as const, available: true as const, ...context };
  } catch {
    return { enabled: true as const, available: false as const };
  }
}

export async function requireTransactionalEligibility(
  userId: string,
  db: PolicyDb = getPrisma() as unknown as PolicyDb,
  now = new Date(),
): Promise<void> {
  const env = getServerEnv();
  if (!env.FEATURE_PILOT_ENROLLMENT && !env.FEATURE_KYC_GATES) return;

  const context = await getActivePilotContext(db, now);
  const [user, membership, consents, kycCase] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { emailVerified: true, status: true } }),
    db.pilotMembership.findUnique({ where: { userId } }),
    db.consentRecord.findMany({
      where: { userId },
      select: { recordType: true, documentVersion: true },
    }),
    env.FEATURE_KYC_GATES
      ? db.kycCase.findFirst({
          where: { userId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        })
      : Promise.resolve(null),
  ]);

  if (!user?.emailVerified || !["ACTIVE", "WARNING"].includes(user.status)) {
    throw new AppError("ACCOUNT_NOT_ELIGIBLE", "このアカウントでは取引操作を行えません。", 403);
  }
  if (!membership || membership.status !== "ACTIVE" || membership.accountType !== "INDIVIDUAL") {
    throw new AppError(
      "PILOT_MEMBERSHIP_REQUIRED",
      "実証運用の有効な個人会員登録が必要です。",
      403,
    );
  }
  if (!context.allowedAreaKeys.includes(membership.areaKey)) {
    throw new AppError("PILOT_AREA_OUTSIDE", "対象地域外のため、この操作を利用できません。", 403);
  }

  const consentKeys = new Set(
    consents.map((entry) => `${entry.recordType}:${entry.documentVersion}`),
  );
  const required = [
    `TERMS:${context.termsVersion}`,
    `PRIVACY:${context.privacyVersion}`,
    "AGE_18_PLUS:age-18-plus-v1",
    "ONE_ACCOUNT:one-account-v1",
  ];
  if (required.some((key) => !consentKeys.has(key))) {
    throw new AppError(
      "POLICY_RECONSENT_REQUIRED",
      "最新の利用規約とプライバシーポリシーへの確認が必要です。",
      403,
    );
  }

  if (env.FEATURE_KYC_GATES) {
    const verified =
      kycCase?.status === "VERIFIED" &&
      kycCase.validFrom !== null &&
      kycCase.validFrom <= now &&
      (kycCase.validUntil === null || kycCase.validUntil > now);
    if (!verified) {
      throw new AppError(
        "VERIFIED_KYC_REQUIRED",
        "本人確認済みになるまで、出品・申込み・取引参加はできません。",
        403,
      );
    }
  }
}

export type PolicyTransactionClient = Prisma.TransactionClient;
export type PolicyPrismaClient = PrismaClient;
