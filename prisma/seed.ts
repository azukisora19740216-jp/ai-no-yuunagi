import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient, type RoleName } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URLが必要です。");
if (process.env.NODE_ENV === "production") {
  throw new Error("本番環境ではseedを実行できません。");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const testPassword = "Local-test-password-123!";

const users = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    email: "admin@example.invalid",
    name: "開発管理者",
    roles: ["USER", "ADMINISTRATOR"] as RoleName[],
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    email: "moderator@example.invalid",
    name: "開発モデレーター",
    roles: ["USER", "MODERATOR"] as RoleName[],
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    email: "provider@example.invalid",
    name: "提供者サンプル",
    roles: ["USER"] as RoleName[],
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    email: "recipient@example.invalid",
    name: "受取人サンプル",
    roles: ["USER"] as RoleName[],
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    email: "auditor@example.invalid",
    name: "開発監査人",
    roles: ["AUDITOR"] as RoleName[],
  },
] as const;

// Opaque, non-usable development hashes. Their plaintext preimages are intentionally not kept.
const developmentInvitationHashes = [
  "3c43d91816c0213011f9acd719f19ab6f1e4345b4d9d67e2c6f816a4e1908291",
  "2b7481ac9d78920dfada40c9dabfffb8fa3c7f884f85e3f6fba0c445acc9d3cb",
  "16fa6c5f7a3c55921c0c8f9defe8f691145d0ee9a4b508628b0a4dfefbdb7b5d",
  "e11b5480f996869dcaaf4f13d37c9758472f1679ab2cbd20f05831be544577b8",
  "09a0bd6792192ed19213367dbf68a4d4184cbeb70723183d11f4df256dcfd88e",
] as const;

const developmentKycSubjectHashes = [
  "71305b213696b22ccb2950ae7a78c9bb37a3384f706718284a455fe60f75b625",
  "f53e8920970cfc1dc9931b9fad308411a2b6a66724cb919998d3e8d979acf533",
  "fbe996a786e7f29d6f2de5dc6b09648800c79757e4b3014fb35d45a91a0cab16",
  "982b4362a97d650c1ef091059b75831e28cfc6c2a0c744cf41425255f04b3cac",
  "503fce2f4128f5dc4e784d5f692b4247b8f0914d90eed08d7feb94921493e257",
] as const;

async function main() {
  const password = await hashPassword(testPassword);

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, emailVerified: true, status: "ACTIVE" },
      create: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: true,
      },
    });
    await prisma.profile.upsert({
      where: { userId: user.id },
      update: { displayName: user.name },
      create: { userId: user.id, displayName: user.name, handoverArea: "地域内（開発用）" },
    });
    for (const role of user.roles) {
      await prisma.userRole.upsert({
        where: { userId_role: { userId: user.id, role } },
        update: {},
        create: { userId: user.id, role, reason: "ローカル開発seed" },
      });
    }
    await prisma.account.upsert({
      where: { providerId_accountId: { providerId: "credential", accountId: user.id } },
      update: { password },
      create: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password,
      },
    });
  }

  const servicePolicyId = "60000000-0000-4000-8000-000000000001";
  if (!(await prisma.servicePolicyVersion.findUnique({ where: { id: servicePolicyId } }))) {
    await prisma.servicePolicyVersion.create({
      data: {
        id: servicePolicyId,
        version: "development-pilot-2026-07-21",
        termsVersion: "development-terms-2026-07-21",
        privacyVersion: "development-privacy-2026-07-21",
        status: "APPROVED",
        effectiveFrom: new Date("2026-07-20T00:00:00.000Z"),
        approvedAt: new Date("2026-07-20T00:00:00.000Z"),
        approvedById: users[0].id,
        pilotSetting: {
          create: {
            id: "60000000-0000-4000-8000-000000000002",
            regionLabel: "倉敷市周辺（開発設定・本番利用不可）",
            allowedAreaKeys: ["kurashiki-dev"],
            registrationLimit: 50,
            inviteOnly: true,
            nationwidePublicEnabled: false,
            effectiveFrom: new Date("2026-07-20T00:00:00.000Z"),
            approvedById: users[0].id,
          },
        },
      },
    });
  }

  for (const [index, user] of users.entries()) {
    const suffix = String(index + 1).padStart(12, "0");
    const invitationCodeHash = developmentInvitationHashes[index];
    const subjectReferenceHash = developmentKycSubjectHashes[index];
    if (!invitationCodeHash || !subjectReferenceHash) {
      throw new Error("開発seed用の不透明ハッシュが不足しています。");
    }
    const invitationId = `61000000-0000-4000-8000-${suffix}`;
    if (!(await prisma.invitation.findUnique({ where: { id: invitationId } }))) {
      await prisma.invitation.create({
        data: {
          id: invitationId,
          codeHash: invitationCodeHash,
          source: "ローカル開発seed（本番利用不可）",
          status: "USED",
          countsTowardLimit: false,
          issuedByUserId: users[0].id,
          issuedAt: new Date("2026-07-20T00:00:00.000Z"),
          expiresAt: new Date("2099-12-31T15:00:00.000Z"),
          usedAt: new Date("2026-07-20T00:01:00.000Z"),
          usedByUserId: user.id,
        },
      });
    }
    if (!(await prisma.pilotMembership.findUnique({ where: { userId: user.id } }))) {
      await prisma.pilotMembership.create({
        data: {
          id: `62000000-0000-4000-8000-${suffix}`,
          userId: user.id,
          invitationId,
          areaKey: "kurashiki-dev",
          status: "ACTIVE",
          countsTowardLimit: false,
          oneAccountAttestedAt: new Date("2026-07-20T00:01:00.000Z"),
        },
      });
    }
    await prisma.consentRecord.createMany({
      data: [
        {
          userId: user.id,
          policyVersionId: servicePolicyId,
          recordType: "TERMS",
          documentVersion: "development-terms-2026-07-21",
          source: "development-seed",
        },
        {
          userId: user.id,
          policyVersionId: servicePolicyId,
          recordType: "PRIVACY",
          documentVersion: "development-privacy-2026-07-21",
          source: "development-seed",
        },
        {
          userId: user.id,
          policyVersionId: servicePolicyId,
          recordType: "AGE_18_PLUS",
          documentVersion: "age-18-plus-v1",
          source: "development-seed",
        },
        {
          userId: user.id,
          policyVersionId: servicePolicyId,
          recordType: "ONE_ACCOUNT",
          documentVersion: "one-account-v1",
          source: "development-seed",
        },
      ],
      skipDuplicates: true,
    });
    if (!(await prisma.kycSubjectClaim.findUnique({ where: { userId: user.id } }))) {
      const kycCase = await prisma.kycCase.create({
        data: {
          id: `63000000-0000-4000-8000-${suffix}`,
          userId: user.id,
          provider: "mock",
          status: "VERIFIED",
          subjectReferenceHash,
          submittedAt: new Date("2026-07-20T00:02:00.000Z"),
          decidedAt: new Date("2026-07-20T00:02:00.000Z"),
          validFrom: new Date("2026-07-20T00:02:00.000Z"),
          reasonCode: "DEVELOPMENT_SEED",
          reviewedByUserId: users[0].id,
        },
      });
      await prisma.kycSubjectClaim.create({
        data: {
          id: `64000000-0000-4000-8000-${suffix}`,
          subjectReferenceHash,
          userId: user.id,
          firstKycCaseId: kycCase.id,
        },
      });
    }
  }

  if (
    !(await prisma.pointPolicyVersion.findUnique({
      where: { version: "development-unapproved-v1" },
    }))
  ) {
    await prisma.pointPolicyVersion.create({
      data: {
        id: "60000000-0000-4000-8000-000000000003",
        version: "development-unapproved-v1",
        status: "DEVELOPMENT",
        effectiveFrom: new Date("2026-07-20T00:00:00.000Z"),
        productionStartedAt: null,
      },
    });
  }

  const categories = [
    ["daily-goods", "生活雑貨"],
    ["books", "書籍"],
    ["clothing", "衣類"],
    ["furniture-small", "小型家具"],
  ] as const;
  for (const [slug, name] of categories) {
    await prisma.category.upsert({
      where: { slug },
      update: { name, active: true },
      create: { slug, name, riskLevel: 0, active: true, requiresReview: true },
    });
  }

  const category = await prisma.category.findUniqueOrThrow({ where: { slug: "books" } });
  await prisma.item.upsert({
    where: { id: "20000000-0000-4000-8000-000000000001" },
    update: {},
    create: {
      id: "20000000-0000-4000-8000-000000000001",
      ownerUserId: users[2].id,
      categoryId: category.id,
      title: "開発用の本セット",
      description: "架空のテスト掲載です。実在する個人情報は含みません。",
      condition: "USED",
      defectDescription: "表紙に軽い擦れがあります。",
      deliveryMethod: "HANDOVER",
      handoverArea: "地域内（開発用）",
      availableDates: ["平日夕方"],
      shippingSupported: false,
      status: "PUBLISHED",
      publishedAt: new Date("2026-07-20T00:00:00.000Z"),
    },
  });

  const reviewItem = await prisma.item.upsert({
    where: { id: "20000000-0000-4000-8000-000000000002" },
    update: {},
    create: {
      id: "20000000-0000-4000-8000-000000000002",
      ownerUserId: users[2].id,
      categoryId: category.id,
      title: "管理確認用の配送テスト物品",
      description: "双方の完了報告まで進んだ架空のテスト取引です。",
      condition: "GOOD",
      deliveryMethod: "SHIPPING",
      handoverArea: "地域内（開発用）",
      availableDates: ["調整済み"],
      shippingSupported: true,
      status: "HANDOVER_IN_PROGRESS",
      publishedAt: new Date("2026-07-20T00:00:00.000Z"),
    },
  });
  const selectedRequest = await prisma.itemRequest.upsert({
    where: { itemId_requesterUserId: { itemId: reviewItem.id, requesterUserId: users[3].id } },
    update: {},
    create: {
      id: "40000000-0000-4000-8000-000000000001",
      itemId: reviewItem.id,
      requesterUserId: users[3].id,
      message: "開発用の受取申込みです。",
      status: "SELECTED",
      selectedAt: new Date("2026-07-20T01:00:00.000Z"),
      selectedByUserId: users[2].id,
    },
  });
  const reviewTransaction = await prisma.transaction.upsert({
    where: { itemId: reviewItem.id },
    update: {},
    create: {
      id: "50000000-0000-4000-8000-000000000001",
      itemId: reviewItem.id,
      selectedRequestId: selectedRequest.id,
      providerUserId: users[2].id,
      recipientUserId: users[3].id,
      status: "UNDER_ADMIN_REVIEW",
      providerReportedAt: new Date("2026-07-20T02:00:00.000Z"),
      recipientReportedAt: new Date("2026-07-20T02:05:00.000Z"),
      bothReportedAt: new Date("2026-07-20T02:05:00.000Z"),
      handoverOccurredAt: new Date("2026-07-20T01:55:00.000Z"),
    },
  });
  const eventSeeds = [
    ["REQUESTED", "RECIPIENT_SELECTED", "recipient_selected"],
    ["RECIPIENT_SELECTED", "ACCEPTED", "recipient_accepted"],
    ["ACCEPTED", "HANDOVER_SCHEDULED", "handover_scheduled"],
    ["HANDOVER_SCHEDULED", "PROVIDER_REPORTED_COMPLETE", "provider_reported_complete"],
    ["PROVIDER_REPORTED_COMPLETE", "UNDER_ADMIN_REVIEW", "recipient_reported_complete"],
  ] as const;
  for (const [fromStatus, toStatus, eventType] of eventSeeds) {
    await prisma.transactionStatusEvent.upsert({
      where: { idempotencyKey: `seed:${reviewTransaction.id}:${eventType}` },
      update: {},
      create: {
        transactionId: reviewTransaction.id,
        fromStatus,
        toStatus,
        eventType,
        actorUserId: eventType === "recipient_accepted" ? users[3].id : users[2].id,
        actorRole: "USER",
        reason: "ローカル開発seed",
        idempotencyKey: `seed:${reviewTransaction.id}:${eventType}`,
      },
    });
  }
}

await main().finally(async () => prisma.$disconnect());
