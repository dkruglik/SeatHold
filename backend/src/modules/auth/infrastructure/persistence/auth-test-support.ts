import pg from "pg";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";

/** Connection and cleanup helpers shared by the auth persistence integration tests. */
export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? "";
}

export function createTestPrisma(poolMax = 6): PrismaService {
  return new PrismaService(databaseUrl(), poolMax);
}

export async function resetAuthTables(prisma: PrismaService): Promise<void> {
  await prisma.client.$executeRawUnsafe("TRUNCATE TABLE sessions, auth_codes, users CASCADE");
}

/** Runs a raw statement on its own pg connection and returns the Postgres error code, or null when it succeeded. */
export async function sqlErrorCode(sql: string, params: unknown[] = []): Promise<string | null> {
  const client = new pg.Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    await client.query(sql, params);
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  } finally {
    await client.end();
  }
}

/** Registers connect, disconnect and table cleanup hooks for the surrounding describe, and returns the client service. */
export function useAuthDatabase(): PrismaService {
  const prisma = createTestPrisma();
  beforeAll(() => prisma.connect());
  afterAll(() => prisma.disconnect());
  beforeEach(() => resetAuthTables(prisma));
  return prisma;
}
