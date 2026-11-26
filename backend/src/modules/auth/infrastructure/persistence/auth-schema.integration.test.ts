import { describe, expect, it } from "vitest";
import { sqlErrorCode, useAuthDatabase } from "./auth-test-support.js";

const NOW = new Date("2026-01-01T12:00:00Z");
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

const insertUser = (email: string, role = "buyer") =>
  sqlErrorCode("INSERT INTO users (email, role, created_at) VALUES ($1, $2, $3)", [email, role, NOW]);

describe("users constraints", () => {
  const prisma = useAuthDatabase();

  it("treats email as case-insensitive: A@x.io then a@X.io is a unique violation", async () => {
    expect(await insertUser("A@x.io")).toBeNull();

    expect(await insertUser("a@X.io")).toBe(UNIQUE_VIOLATION);
  });

  it("defaults the role to buyer", async () => {
    await sqlErrorCode("INSERT INTO users (email, created_at) VALUES ($1, $2)", ["d@x.io", NOW]);

    const rows = await prisma.client.$queryRaw<{ role: string }[]>`SELECT role FROM users`;
    expect(rows[0]?.role).toBe("buyer");
  });

  it("rejects a role other than buyer or admin", async () => {
    expect(await insertUser("s@x.io", "superuser")).toBe(CHECK_VIOLATION);
    expect(await insertUser("a@x.io", "admin")).toBeNull();
  });
});

describe("auth_codes and sessions constraints", () => {
  const prisma = useAuthDatabase();

  it("rejects negative login code attempts", async () => {
    const code = await sqlErrorCode(
      "INSERT INTO auth_codes (email, code_hash, expires_at, attempts, created_at) VALUES ($1, 'h', $2, -1, $2)",
      ["c@x.io", NOW],
    );

    expect(code).toBe(CHECK_VIOLATION);
  });

  it("keeps session token hashes unique", async () => {
    await insertUser("u@x.io");
    const insertSession = () =>
      sqlErrorCode(
        "INSERT INTO sessions (user_id, token_hash, created_at, expires_at) SELECT id, 'same-hash', $1, $1 FROM users",
        [NOW],
      );
    expect(await insertSession()).toBeNull();

    expect(await insertSession()).toBe(UNIQUE_VIOLATION);
  });

  it("deletes a user's sessions with the user", async () => {
    await insertUser("u@x.io");
    await sqlErrorCode(
      "INSERT INTO sessions (user_id, token_hash, created_at, expires_at) SELECT id, 'h1', $1, $1 FROM users",
      [NOW],
    );

    await prisma.client.$executeRaw`DELETE FROM users`;

    const rows = await prisma.client.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM sessions`;
    expect(rows[0]?.n).toBe(0);
  });

  it("has the (email, created_at DESC) index on auth_codes", async () => {
    const rows = await prisma.client.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'auth_codes'`;

    expect(rows.some((row) => /\(email, created_at DESC\)/.test(row.indexdef))).toBe(true);
  });
});
