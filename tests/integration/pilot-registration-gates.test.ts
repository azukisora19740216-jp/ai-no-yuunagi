import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { CurrentActor } from "@/modules/identity/application/current-actor";
import { saveItemDraft } from "@/modules/items/application/item-service";
import { issueInvitation } from "@/modules/pilot/application/invitation-service";
import { recordMockKycDecision } from "@/modules/pilot/application/kyc-service";
import { requireTransactionalEligibility } from "@/modules/pilot/application/pilot-policy-service";
import { registerInvitedMember } from "@/modules/pilot/application/registration-service";
import { hashInvitationCode } from "@/modules/pilot/domain/invitation-code";
import { resetServerEnvForTests } from "@/shared/config/env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
const prisma = connectionString
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  : undefined;
const originalPolicyEnv = {
  FEATURE_PILOT_ENROLLMENT: process.env.FEATURE_PILOT_ENROLLMENT,
  FEATURE_KYC_GATES: process.env.FEATURE_KYC_GATES,
  ALLOW_MOCK_ADAPTERS: process.env.ALLOW_MOCK_ADAPTERS,
  KYC_DRIVER: process.env.KYC_DRIVER,
};

const administrator: CurrentActor = {
  id: crypto.randomUUID(),
  name: "PD administrator",
  email: `pd-admin-${crypto.randomUUID()}@example.invalid`,
  emailVerified: true,
  status: "ACTIVE",
  roles: ["ADMINISTRATOR"],
};
let categoryId = "";

function registrationInput(
  code: string,
  email = `pd-member-${crypto.randomUUID()}@example.invalid`,
) {
  return {
    name: "Pilot member",
    email,
    password: "test-password-12345",
    invitationCode: code,
    areaKey: "kurashiki-test",
    age18OrOver: true,
    termsAgreed: true,
    privacyAcknowledged: true,
    oneAccountAttested: true,
  };
}

async function freshInvitation() {
  return issueInvitation(administrator, {
    source: "integration-test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    countsTowardLimit: true,
  });
}

describe.skipIf(!connectionString)("PD-01..03 pilot registration and transactional gates", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = connectionString;
    process.env.APP_URL = "http://127.0.0.1:3000";
    process.env.AUTH_SECRET = "integration-test-auth-secret-at-least-32-characters";
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = "1025";
    process.env.MAIL_FROM = "test@example.invalid";
    process.env.FEATURE_PILOT_ENROLLMENT = "true";
    process.env.FEATURE_KYC_GATES = "true";
    process.env.ALLOW_MOCK_ADAPTERS = "true";
    process.env.KYC_DRIVER = "mock";
    resetServerEnvForTests();

    await prisma!.user.create({
      data: {
        id: administrator.id,
        name: administrator.name,
        email: administrator.email,
        emailVerified: true,
      },
    });
    await prisma!.servicePolicyVersion.create({
      data: {
        version: `pilot-test-${crypto.randomUUID()}`,
        termsVersion: "terms-test-v1",
        privacyVersion: "privacy-test-v1",
        status: "APPROVED",
        effectiveFrom: new Date(Date.now() - 60_000),
        approvedAt: new Date(),
        approvedById: administrator.id,
        pilotSetting: {
          create: {
            regionLabel: "倉敷市テスト対象地域",
            allowedAreaKeys: ["kurashiki-test"],
            registrationLimit: 100,
            inviteOnly: true,
            nationwidePublicEnabled: false,
            effectiveFrom: new Date(Date.now() - 60_000),
            approvedById: administrator.id,
          },
        },
      },
    });
    categoryId = (
      await prisma!.category.create({
        data: { slug: `pd-gate-${crypto.randomUUID()}`, name: "PD gate test" },
      })
    ).id;
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(originalPolicyEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetServerEnvForTests();
    await prisma?.$disconnect();
  });

  it("rejects registration without an issued invitation", async () => {
    await expect(registerInvitedMember(registrationInput("not-issued"))).rejects.toMatchObject({
      code: "INVITATION_UNAVAILABLE",
    });
  });

  it("rejects expired and already-used single-use invitations", async () => {
    const expiredCode = `expired-${crypto.randomUUID()}`;
    await prisma!.invitation.create({
      data: {
        codeHash: hashInvitationCode(expiredCode),
        source: "expired-test",
        issuedByUserId: administrator.id,
        issuedAt: new Date(Date.now() - 60 * 60 * 1000),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    await expect(registerInvitedMember(registrationInput(expiredCode))).rejects.toMatchObject({
      code: "INVITATION_UNAVAILABLE",
    });

    const { code } = await freshInvitation();
    await registerInvitedMember(registrationInput(code));
    await expect(registerInvitedMember(registrationInput(code))).rejects.toMatchObject({
      code: "INVITATION_UNAVAILABLE",
    });
  });

  it("rejects minors and missing mandatory consent/attestation without consuming the invitation", async () => {
    const { code, invitation } = await freshInvitation();
    await expect(
      registerInvitedMember({ ...registrationInput(code), age18OrOver: false }),
    ).rejects.toThrow();
    await expect(
      registerInvitedMember({ ...registrationInput(code), termsAgreed: false }),
    ).rejects.toThrow();
    await expect(
      registerInvitedMember({ ...registrationInput(code), privacyAcknowledged: false }),
    ).rejects.toThrow();
    await expect(
      registerInvitedMember({ ...registrationInput(code), oneAccountAttested: false }),
    ).rejects.toThrow();
    expect(await prisma!.invitation.findUnique({ where: { id: invitation.id } })).toMatchObject({
      status: "ISSUED",
      usedAt: null,
    });
  });

  it("requires current consent, verified KYC and the configured pilot area for listing", async () => {
    const { code } = await freshInvitation();
    const member = await registerInvitedMember(registrationInput(code));
    const actor: CurrentActor = {
      id: member.id,
      name: "Pilot member",
      email: member.email,
      emailVerified: true,
      status: "ACTIVE",
      roles: ["USER"],
    };
    await prisma!.user.update({ where: { id: member.id }, data: { emailVerified: true } });

    await expect(
      saveItemDraft(actor, {
        title: "KYC gate item",
        description: "No price or shipping amount is collected.",
        categoryId,
        condition: "GOOD",
        deliveryMethod: "HANDOVER",
        handoverArea: "倉敷市",
        availableDates: ["調整後に決定"],
        shippingSupported: false,
      }),
    ).rejects.toMatchObject({ code: "VERIFIED_KYC_REQUIRED" });

    await recordMockKycDecision(administrator, {
      userId: member.id,
      status: "VERIFIED",
      subjectReference: `subject-${crypto.randomUUID()}`,
    });
    await expect(requireTransactionalEligibility(member.id)).resolves.toBeUndefined();
    await prisma!.pilotMembership.update({
      where: { userId: member.id },
      data: { areaKey: "outside-pilot" },
    });
    await expect(requireTransactionalEligibility(member.id)).rejects.toMatchObject({
      code: "PILOT_AREA_OUTSIDE",
    });
  });

  it("requires re-consent after a policy document version changes", async () => {
    const { code } = await freshInvitation();
    const member = await registerInvitedMember(registrationInput(code));
    await prisma!.user.update({ where: { id: member.id }, data: { emailVerified: true } });
    await recordMockKycDecision(administrator, {
      userId: member.id,
      status: "VERIFIED",
      subjectReference: `subject-${crypto.randomUUID()}`,
    });
    const nextPolicy = await prisma!.servicePolicyVersion.create({
      data: {
        version: `pilot-test-v2-${crypto.randomUUID()}`,
        termsVersion: "terms-test-v2",
        privacyVersion: "privacy-test-v2",
        status: "APPROVED",
        effectiveFrom: new Date(),
        approvedAt: new Date(),
        approvedById: administrator.id,
        pilotSetting: {
          create: {
            regionLabel: "倉敷市テスト対象地域",
            allowedAreaKeys: ["kurashiki-test"],
            registrationLimit: 100,
            inviteOnly: true,
            nationwidePublicEnabled: false,
            effectiveFrom: new Date(),
            approvedById: administrator.id,
          },
        },
      },
    });
    await expect(requireTransactionalEligibility(member.id)).rejects.toMatchObject({
      code: "POLICY_RECONSENT_REQUIRED",
    });
    await prisma!.consentRecord.createMany({
      data: [
        {
          userId: member.id,
          policyVersionId: nextPolicy.id,
          recordType: "TERMS",
          documentVersion: "terms-test-v2",
          source: "integration-test",
        },
        {
          userId: member.id,
          policyVersionId: nextPolicy.id,
          recordType: "PRIVACY",
          documentVersion: "privacy-test-v2",
          source: "integration-test",
        },
      ],
    });
    await expect(requireTransactionalEligibility(member.id)).resolves.toBeUndefined();
  });

  it("rejects registration atomically after the configured counted-member limit", async () => {
    await prisma!.servicePolicyVersion.create({
      data: {
        version: `pilot-limit-${crypto.randomUUID()}`,
        termsVersion: "terms-limit-v1",
        privacyVersion: "privacy-limit-v1",
        status: "APPROVED",
        effectiveFrom: new Date(),
        approvedAt: new Date(),
        approvedById: administrator.id,
        pilotSetting: {
          create: {
            regionLabel: "倉敷市テスト対象地域",
            allowedAreaKeys: ["kurashiki-test"],
            registrationLimit: 1,
            inviteOnly: true,
            nationwidePublicEnabled: false,
            effectiveFrom: new Date(),
            approvedById: administrator.id,
          },
        },
      },
    });
    const { code } = await freshInvitation();
    const input = registrationInput(code);
    await expect(registerInvitedMember(input)).rejects.toMatchObject({
      code: "PILOT_REGISTRATION_LIMIT_REACHED",
    });
    expect(await prisma!.user.count({ where: { email: input.email } })).toBe(0);
  });

  it("does not permit non-administrators to issue invitations or record KYC decisions", async () => {
    const ordinary: CurrentActor = {
      id: crypto.randomUUID(),
      name: "ordinary",
      email: `ordinary-${crypto.randomUUID()}@example.invalid`,
      emailVerified: true,
      status: "ACTIVE",
      roles: ["USER"],
    };
    await expect(
      issueInvitation(ordinary, {
        source: "forbidden",
        expiresAt: new Date(Date.now() + 60_000),
        countsTowardLimit: true,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      recordMockKycDecision(ordinary, {
        userId: administrator.id,
        status: "PENDING",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
