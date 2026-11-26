import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const pgAdapter = vi.fn();

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: vi.fn(function (options: unknown) { pgAdapter(options); }) }));
vi.mock("../../generated/prisma/client.js", () => ({ PrismaClient: vi.fn(function () { return undefined; }) }));

describe("PrismaService", () => {
  let PrismaService: typeof import("./prisma-service.js").PrismaService;

  beforeAll(async () => {
    vi.resetModules();
    ({ PrismaService } = await import("./prisma-service.js"));
  });

  afterAll(() => {
    vi.resetModules();
  });

  it("sizes the connection pool from the given maximum", () => {
    pgAdapter.mockClear();

    new PrismaService("postgresql://u:p@h:5432/db", 7);

    expect(pgAdapter).toHaveBeenCalledExactlyOnceWith({ connectionString: "postgresql://u:p@h:5432/db", max: 7 });
  });
});
