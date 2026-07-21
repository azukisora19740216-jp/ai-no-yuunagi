import { expect, test } from "@playwright/test";

test.describe("招待制・KYC実証運用", () => {
  test.skip(!process.env.E2E_FULL_POLICY, "policy feature flags と PostgreSQL seed が必要です");

  test("招待・対象地域・18歳・版付き同意を登録画面で要求し、無効な招待を拒否する", async ({
    page,
  }) => {
    await page.goto("/register");
    await expect(page.getByLabel("運営者発行の招待コード")).toBeVisible();
    await expect(page.getByLabel("対象地域")).toBeVisible();
    await expect(page.getByLabel("私は18歳以上です")).toBeVisible();
    await expect(page.getByLabel(/利用規約（版:/)).toBeVisible();
    await expect(page.getByLabel(/プライバシーポリシー（版:/)).toBeVisible();

    await page.getByLabel("運営者発行の招待コード").fill("invalid-invitation");
    await page.getByLabel("対象地域").selectOption({ index: 1 });
    await page.getByLabel("表示名").fill("E2E 招待テスト");
    await page.getByLabel("メールアドレス").fill(`policy-e2e-${Date.now()}@example.invalid`);
    await page.getByLabel("パスワード").fill("Policy-e2e-password-123!");
    await page.getByLabel("私は18歳以上です").check();
    await page.getByLabel(/個人として登録し/).check();
    await page.getByLabel(/利用規約（版:/).check();
    await page.getByLabel(/プライバシーポリシー（版:/).check();
    await page.getByRole("button", { name: "会員登録" }).click();
    await expect(page.getByRole("status")).toContainText(
      "招待コードが無効、使用済み、または期限切れです。",
    );
  });

  test("管理者だけが招待・KYC管理画面を利用できる", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("メールアドレス").fill("admin@example.invalid");
    await page.getByLabel("パスワード").fill("Local-test-password-123!");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page).toHaveURL(/dashboard/);
    await page.goto("/admin/pilot");
    await expect(page.getByRole("heading", { name: "実証運用・招待・本人確認" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "単回招待コード発行" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "開発用KYCモック" })).toBeVisible();
    await expect(
      page.getByText("モック本人確認は開発環境でのみ有効です。", { exact: false }),
    ).toBeVisible();
  });
});
