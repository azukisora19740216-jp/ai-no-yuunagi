import { spawn } from "node:child_process";
import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const serverEntry = path.join(root, ".next", "standalone", "server.js");
const staticSource = path.join(root, ".next", "static");
const staticDestination = path.join(root, ".next", "standalone", ".next", "static");
const localBrowserPath = path.join(root, ".local-data", "playwright");

async function playwrightEnvironment() {
  try {
    await stat(localBrowserPath);
    return { ...process.env, PLAYWRIGHT_BROWSERS_PATH: localBrowserPath };
  } catch {
    return process.env;
  }
}

async function ensureBuildExists() {
  try {
    await stat(serverEntry);
  } catch {
    throw new Error("E2E実行前に `pnpm build` を実行してください。");
  }

  await mkdir(path.dirname(staticDestination), { recursive: true });
  await cp(staticSource, staticDestination, { recursive: true, force: true });
}

async function waitUntilReady(server) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`E2Eサーバーが起動前に終了しました (exit=${server.exitCode})。`);
    }
    try {
      const response = await fetch("http://127.0.0.1:3000/api/health");
      if (response.ok) return;
    } catch {
      // 起動中は接続できないため短時間待って再試行する。
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("E2Eサーバーが30秒以内に起動しませんでした。");
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve();
  return Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

await ensureBuildExists();

const server = spawn(process.execPath, [serverEntry], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: "127.0.0.1",
    PORT: "3000",
    APP_URL: process.env.APP_URL ?? "http://127.0.0.1:3000",
    DATABASE_URL:
      process.env.DATABASE_URL ?? "postgresql://unused:unused@127.0.0.1:5432/unused?schema=public",
    AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-authentication-secret-for-tests-only-12345",
    LOG_LEVEL: process.env.LOG_LEVEL ?? "warn",
    FEATURE_PILOT_ENROLLMENT: process.env.FEATURE_PILOT_ENROLLMENT ?? "false",
    FEATURE_KYC_GATES: process.env.FEATURE_KYC_GATES ?? "false",
    FEATURE_FORMAL_POINTS: process.env.FEATURE_FORMAL_POINTS ?? "false",
    FEATURE_POINT_EXPIRY: process.env.FEATURE_POINT_EXPIRY ?? "false",
    FEATURE_POINT_EXPIRY_NOTIFICATIONS: process.env.FEATURE_POINT_EXPIRY_NOTIFICATIONS ?? "false",
    NATIONWIDE_PUBLIC_ENABLED: "false",
    ALLOW_MOCK_ADAPTERS: "false",
    EMAIL_DRIVER: "external",
    KYC_DRIVER: process.env.KYC_DRIVER === "external" ? "external" : "disabled",
    SHIPPING_DRIVER: process.env.SHIPPING_DRIVER === "external" ? "external" : "disabled",
    STORAGE_DRIVER: "s3",
    S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://127.0.0.1:9000",
    S3_REGION: process.env.S3_REGION ?? "test",
    S3_BUCKET: process.env.S3_BUCKET ?? "test",
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? "test-only",
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? "test-only",
    SMTP_HOST: process.env.SMTP_HOST ?? "127.0.0.1",
    SMTP_PORT: process.env.SMTP_PORT ?? "1025",
    MAIL_FROM: process.env.MAIL_FROM ?? "no-reply@example.invalid",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

server.stdout.on("data", (chunk) => process.stdout.write(`[E2E server] ${chunk}`));
server.stderr.on("data", (chunk) => process.stderr.write(`[E2E server] ${chunk}`));

let exitCode = 1;
try {
  await waitUntilReady(server);
  const playwrightCli = path.join(root, "node_modules", "@playwright", "test", "cli.js");
  const runner = spawn(process.execPath, [playwrightCli, "test", ...process.argv.slice(2)], {
    cwd: root,
    env: await playwrightEnvironment(),
    stdio: "inherit",
  });
  exitCode = await new Promise((resolve, reject) => {
    runner.once("error", reject);
    runner.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  if (server.exitCode === null) server.kill();
  await waitForExit(server, 5_000);
}

process.exitCode = exitCode;
