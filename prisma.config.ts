import "dotenv/config";
import { defineConfig } from "prisma/config";

const cliDatabaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://ainoyuunagi:local_only_password@localhost:5432/ainoyuunagi?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: cliDatabaseUrl,
  },
});
