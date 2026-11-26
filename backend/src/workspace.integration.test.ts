import pg from "pg";
import { describe, expect, it } from "vitest";

describe("test database", () => {
  it("is reachable through DATABASE_URL", async () => {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const result = await client.query<{ ok: number }>("SELECT 1 AS ok");

      expect(result.rows[0]?.ok).toBe(1);
    } finally {
      await client.end();
    }
  });
});
