import { expect, test } from "@playwright/test";

test("日本語のトップページと無償譲渡の原則を表示する", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/藍の夕凪/);
  await expect(page.getByRole("heading", { level: 1, name: "藍の夕凪" })).toBeVisible();
  await expect(page.getByText("無償譲渡に限定")).toBeVisible();
});

test("health endpointは内部情報を含まず応答する", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({ status: "ok", service: "ai-no-yuunagi" });
});

test.describe("実DBを使う主要フロー", () => {
  test.skip(!process.env.E2E_FULL, "実DBを使用するCIで実行します");
  test("ログインして提供物品の管理画面を表示する", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("メールアドレス").fill("provider@example.invalid");
    await page.getByLabel("パスワード").fill("Local-test-password-123!");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.getByRole("heading", { name: "マイページ" })).toBeVisible();
    await expect(page.getByText("開発用の本セット")).toBeVisible();
    await page.goto("/transactions");
    await expect(page.getByRole("heading", { name: "取引" })).toBeVisible();
    await expect(page.getByText("管理確認用の配送テスト物品")).toBeVisible();
    await expect(page.getByText("運営確認待ち")).toBeVisible();
  });

  test("管理者が取引確認と追記型ポイント台帳を閲覧できる", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("メールアドレス").fill("admin@example.invalid");
    await page.getByLabel("パスワード").fill("Local-test-password-123!");
    await page.getByRole("button", { name: "ログイン" }).click();
    await expect(page).toHaveURL(/dashboard/);
    await page.goto("/admin/transactions");
    await expect(page.getByRole("heading", { name: "取引確認" })).toBeVisible();
    await expect(page.getByText("管理確認用の配送テスト物品")).toBeVisible();
    await expect(page.getByRole("button", { name: "確認してポイントを確定" })).toBeVisible();
    await page.goto("/admin/points");
    await expect(page.getByRole("heading", { name: "ポイント台帳", exact: true })).toBeVisible();
    await expect(page.getByText(/残高の直接上書きはできません/)).toBeVisible();
  });
});
