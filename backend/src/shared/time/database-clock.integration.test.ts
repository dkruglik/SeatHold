import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { PrismaService } from "../../infrastructure/persistence/prisma-service.js";
import { DatabaseClock } from "./database-clock.js";

describe("DatabaseClock", () => {
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaService(databaseUrl, 2);

  beforeAll(() => prisma.connect());
  afterAll(() => prisma.disconnect());

  it("returns the database time, within a second of a separate clock_timestamp()", async () => {
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const now = await new DatabaseClock(prisma).now();
      const reference = await client.query<{ now: Date }>("SELECT clock_timestamp() AS now");

      expect(now).toBeInstanceOf(Date);
      expect(Math.abs(now.getTime() - (reference.rows[0]?.now.getTime() ?? 0))).toBeLessThan(1000);
    } finally {
      await client.end();
    }
  });
});
