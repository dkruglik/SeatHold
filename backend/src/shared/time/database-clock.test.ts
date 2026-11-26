import { describe, expect, it } from "vitest";
import { InfrastructureError } from "../errors/app-error.js";
import type { PrismaService } from "../../infrastructure/persistence/prisma-service.js";
import { DatabaseClock } from "./database-clock.js";

function stubPrisma(rows: Array<{ now: Date }>): PrismaService {
  return { client: { $queryRaw: () => Promise.resolve(rows) } } as unknown as PrismaService;
}

describe("DatabaseClock (stub client)", () => {
  it("returns exactly the timestamp the database answered, not the local clock", async () => {
    const databaseTime = new Date("2001-01-01T00:00:00.000Z");

    const now = await new DatabaseClock(stubPrisma([{ now: databaseTime }])).now();

    expect(now.toISOString()).toBe("2001-01-01T00:00:00.000Z");
  });

  it("throws an InfrastructureError when the database returns no row", async () => {
    const error = await new DatabaseClock(stubPrisma([])).now().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InfrastructureError);
    expect((error as InfrastructureError).message).toBe("SELECT clock_timestamp() returned no row");
  });
});
