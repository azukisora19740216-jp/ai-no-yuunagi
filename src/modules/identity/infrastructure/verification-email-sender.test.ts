import { describe, expect, it, vi } from "vitest";
import { createVerificationEmailSender } from "./verification-email-sender";

const message = {
  recipientEmail: "member@example.invalid",
  subject: "メールアドレス確認",
  actionUrl: "https://preview.prisma.build/verify?token=test-token",
};

describe("createVerificationEmailSender", () => {
  it("disabledでは保存や送信済み扱いの前にfail closedにする", async () => {
    const create = vi.fn();
    const sender = createVerificationEmailSender(
      {
        DEPLOYMENT_ROLE: "preview",
        ALLOW_MOCK_ADAPTERS: false,
        EMAIL_DRIVER: "disabled",
      },
      { create },
    );

    await expect(sender(message)).rejects.toMatchObject({
      code: "EMAIL_DELIVERY_DISABLED",
      statusCode: 503,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("previewではmockメールを拒否する", async () => {
    const create = vi.fn();
    const sender = createVerificationEmailSender(
      {
        DEPLOYMENT_ROLE: "preview",
        ALLOW_MOCK_ADAPTERS: true,
        EMAIL_DRIVER: "mock",
      },
      { create },
    );

    await expect(sender(message)).rejects.toMatchObject({
      code: "MOCK_EMAIL_FORBIDDEN",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("localの明示的なmock設定だけを保存する", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const sender = createVerificationEmailSender(
      {
        DEPLOYMENT_ROLE: "local",
        ALLOW_MOCK_ADAPTERS: true,
        EMAIL_DRIVER: "mock",
      },
      { create },
    );

    await sender(message);

    expect(create).toHaveBeenCalledWith(message);
  });
});
