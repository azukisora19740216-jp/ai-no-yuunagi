import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import type { CurrentActor } from "@/modules/identity/application/current-actor";
import {
  createItemRequest,
  selectItemRequest,
} from "@/modules/item-requests/application/item-request-service";
import {
  reviewItem,
  saveItemDraft,
  submitItemForReview,
} from "@/modules/items/application/item-service";
import { afterAll, describe, expect, it } from "vitest";

const connectionString = process.env.TEST_DATABASE_URL;
const prisma = connectionString
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  : undefined;

const provider: CurrentActor = {
  id: "30000000-0000-4000-8000-000000000001",
  name: "統合テスト提供者",
  email: "integration-provider@example.invalid",
  emailVerified: true,
  status: "ACTIVE",
  roles: ["USER"],
};
const recipient: CurrentActor = {
  id: "30000000-0000-4000-8000-000000000002",
  name: "統合テスト受取人",
  email: "integration-recipient@example.invalid",
  emailVerified: true,
  status: "ACTIVE",
  roles: ["USER"],
};
const moderator: CurrentActor = {
  id: "30000000-0000-4000-8000-000000000003",
  name: "統合テスト審査者",
  email: "integration-moderator@example.invalid",
  emailVerified: true,
  status: "ACTIVE",
  roles: ["MODERATOR"],
};

describe.skipIf(!connectionString)("phase 1 workflow", () => {
  afterAll(async () => prisma?.$disconnect());

  it("registers a member and creates mock verification mail", async () => {
    const { auth } = await import("@/modules/identity/infrastructure/auth");
    const email = `signup-${crypto.randomUUID()}@example.invalid`;
    await auth.api.signUpEmail({
      body: { name: "登録テスト", email, password: "Integration-password-123!" },
    });

   const user = await prisma!.user.findUniqueOrThrow({
      where: { email },
      include: { roles: true, profile: true, accounts: true },
    });
    expect(user.emailVerified).toBe(false);
    expect(user.roles.map(({ role }) => role)).toContain("USER");
    expect(user.profile?.displayName).toBe("登録テスト");
    expect(user.accounts[0]?.password).toBeTruthy();

    // mockEmail は userId を持たない（FK違反を避けるための仕様）ため、
    // User.mockEmails リレーション経由では取得できない。
    // recipientEmail で直接検索する。
    const mockEmail = await prisma!.mockEmail.findFirst({
      where: { recipientEmail: email },
      orderBy: { createdAt: "desc" },
    });
    console.log("DEBUG mockEmail:", email, JSON.stringify(mockEmail));
    expect(mockEmail).not.toBeNull();   
    expect(mockEmail?.userId).toBeNull();
    expect(mockEmail?.actionUrl).toContain("token=");
  });

  it("moves draft through approval, request, and provider selection atomically", async () => {
    for (const actor of [provider, recipient, moderator]) {
      await prisma!.user.upsert({
        where: { email: actor.email },
        update: {},
        create: { id: actor.id, email: actor.email, name: actor.name, emailVerified: true },
      });
      for (const role of actor.roles) {
        await prisma!.userRole.upsert({
          where: { userId_role: { userId: actor.id, role } },
          update: {},
          create: { userId: actor.id, role, reason: "統合テスト" },
        });
      }
    }
    const category = await prisma!.category.upsert({
      where: { slug: "integration-books" },
      update: { active: true },
      create: { slug: "integration-books", name: "統合テスト書籍" },
    });

    const draft = await saveItemDraft(provider, {
      title: "統合テスト物品",
      description: "金銭授受を伴わないテスト物品です。",
      categoryId: category.id,
      condition: "GOOD",
      defectDescription: "",
      deliveryMethod: "HANDOVER",
      handoverArea: "テスト地域",
      availableDates: ["平日夕方"],
      shippingSupported: false,
    });
    expect(draft.status).toBe("DRAFT");
    await submitItemForReview(provider, draft.id);
    await reviewItem(moderator, draft.id, "approve", "統合テストで内容を確認");

    await expect(createItemRequest(provider, draft.id, "自己申込み")).rejects.toMatchObject({
      code: "SELF_REQUEST_FORBIDDEN",
    });
    const request = await createItemRequest(recipient, draft.id, "受取りを希望します。");
    await selectItemRequest(provider, request.id);

    const result = await prisma!.item.findUniqueOrThrow({
      where: { id: draft.id },
      include: { requests: true },
    });
    expect(result.status).toBe("RESERVED");
    expect(result.requests).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: request.id, status: "SELECTED" })]),
    );
    const auditCount = await prisma!.auditEvent.count({ where: { targetId: draft.id } });
    expect(auditCount).toBeGreaterThanOrEqual(3);
  });
});
