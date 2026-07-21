import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { getPrisma } from "@/shared/db/prisma";
import { getServerEnv } from "@/shared/config/env";

const env = getServerEnv();

export const auth = betterAuth({
  appName: "藍の夕凪",
  baseURL: env.APP_URL,
  secret: env.AUTH_SECRET,
  database: prismaAdapter(getPrisma(), {
    provider: "postgresql",
    transaction: true,
  }),
  trustedOrigins: [env.APP_URL],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: false,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      if (!env.ALLOW_MOCK_ADAPTERS || env.EMAIL_DRIVER !== "mock") {
        throw new Error("外部メール配信アダプターは未設定です。");
      }
      try {
        await getPrisma().mockEmail.create({
          data: {
            recipientEmail: user.email,
            subject: "メールアドレス確認",
            actionUrl: url,
          },
        });
      } catch (e) {
        // better-auth の runInBackgroundOrAwait は、このコールバック内の例外を
        // ログに出すだけで再スローしない。原因調査のため、ここで一度必ず
        // 実エラーを可視化してから再スローする（正常系の挙動は変更しない）。
        console.error("[mockEmail.create failed]", e);
        throw e;
      }
    },
    afterEmailVerification: async (user) => {
      await getPrisma().auditEvent.create({
        data: {
          actorType: "USER",
          actorId: user.id,
          actorRole: "USER",
          action: "member.email_verified",
          targetType: "user",
          targetId: user.id,
          reason: "メール確認リンクによる確認",
          afterSafeJson: { emailVerified: true },
          requestId: crypto.randomUUID(),
          result: "SUCCEEDED",
        },
      });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
  },
  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    database: { generateId: "uuid" },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await getPrisma().$transaction(async (transaction) => {
            await transaction.userRole.create({
              data: {
                userId: user.id,
                role: "USER",
                reason: "会員登録時の基本ロール",
              },
            });
            await transaction.profile.create({
              data: { userId: user.id, displayName: user.name },
            });
            await transaction.auditEvent.create({
              data: {
                actorType: "USER",
                actorId: user.id,
                actorRole: "USER",
                action: "member.registered",
                targetType: "user",
                targetId: user.id,
                reason: "本人による会員登録",
                afterSafeJson: { status: "ACTIVE", emailVerified: false },
                requestId: crypto.randomUUID(),
                result: "SUCCEEDED",
              },
            });
          });
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          await getPrisma().$transaction(async (transaction) => {
            const roles = await transaction.userRole.findMany({
              where: { userId: session.userId },
              select: { role: true },
            });
            await transaction.user.update({
              where: { id: session.userId },
              data: { lastLoginAt: new Date() },
            });
            await transaction.auditEvent.create({
              data: {
                actorType: "USER",
                actorId: session.userId,
                actorRole: roles.map(({ role }) => role).join(","),
                action: "member.logged_in",
                targetType: "user",
                targetId: session.userId,
                reason: "認証成功によるセッション作成",
                afterSafeJson: { sessionCreated: true },
                requestId: crypto.randomUUID(),
                result: "SUCCEEDED",
              },
            });
          });
        },
      },
    },
  },
});
