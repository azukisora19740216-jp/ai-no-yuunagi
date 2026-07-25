import type { ServerEnv } from "@/shared/config/env";
import { getServerEnv } from "@/shared/config/env";
import { getPrisma } from "@/shared/db/prisma";
import { AppError } from "@/shared/errors/app-error";

type VerificationEmail = {
  recipientEmail: string;
  subject: string;
  actionUrl: string;
};

type MockEmailStore = {
  create(message: VerificationEmail): Promise<void>;
};

type EmailRuntime = Pick<ServerEnv, "ALLOW_MOCK_ADAPTERS" | "DEPLOYMENT_ROLE" | "EMAIL_DRIVER">;

export function assertVerificationEmailDeliveryAvailable(env: EmailRuntime) {
  if (env.EMAIL_DRIVER === "disabled") {
    throw new AppError(
      "EMAIL_DELIVERY_DISABLED",
      "メール配信が設定されていないため、確認メールを送信できません。",
      503,
    );
  }

  if (env.EMAIL_DRIVER === "external") {
    throw new AppError(
      "EMAIL_ADAPTER_NOT_CONFIGURED",
      "本番メール配信アダプターが設定されていません。",
      503,
    );
  }

  const mockRole = env.DEPLOYMENT_ROLE === "local" || env.DEPLOYMENT_ROLE === "test";
  if (!mockRole || !env.ALLOW_MOCK_ADAPTERS) {
    throw new AppError(
      "MOCK_EMAIL_FORBIDDEN",
      "この環境では開発用メール配信を使用できません。",
      503,
    );
  }
}

export function createVerificationEmailSender(env: EmailRuntime, mockStore: MockEmailStore) {
  return async (message: VerificationEmail) => {
    assertVerificationEmailDeliveryAvailable(env);
    await mockStore.create(message);
  };
}

export async function sendVerificationEmail(message: VerificationEmail) {
  const sender = createVerificationEmailSender(getServerEnv(), {
    async create(mockMessage) {
      await getPrisma().mockEmail.create({ data: mockMessage });
    },
  });
  await sender(message);
}
