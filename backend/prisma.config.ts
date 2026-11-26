import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

// The Prisma CLI does not read the repository-root .env. The app does, through --env-file on tsx.
// loadEnvFile does not replace a DATABASE_URL already set in the environment (CI and the test database).
const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
