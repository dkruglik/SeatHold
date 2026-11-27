import { describe, expect, it } from "vitest";
import { BusinessError, InfrastructureError } from "../errors/app-error.js";
import { guarded } from "./guarded.js";

const failing = (error: unknown) => () => Promise.reject(error);

describe("guarded", () => {
  it("returns the value of a successful call", async () => {
    await expect(guarded("read", () => Promise.resolve(42))).resolves.toBe(42);
  });

  it("turns a failure into an InfrastructureError holding the operation and the short code only", async () => {
    const error = await guarded("create hold", failing(Object.assign(new Error("INSERT INTO t VALUES ('a@example.com')"), { code: "P2002" }))).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InfrastructureError);
    expect((error as Error).message).toBe("Persistence failed: create hold (P2002)");
    expect((error as Error).cause).toBeUndefined();
  });

  it("omits the code unless it is 2 to 8 upper-case letters or digits", async () => {
    for (const code of ["a", "X", "lowercase", "TOOLONGCODE", "AB-1", 5, null, undefined]) {
      const error = await guarded("op", failing({ code })).catch((e: unknown) => e);
      expect((error as Error).message).toBe("Persistence failed: op");
    }
    const edge = await guarded("op", failing({ code: "23505" })).catch((e: unknown) => e);
    expect((edge as Error).message).toBe("Persistence failed: op (23505)");
  });

  it("handles a thrown non-object without leaking it", async () => {
    for (const thrown of ["SELECT secret", null, undefined]) {
      const error = await guarded("op", failing(thrown)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(InfrastructureError);
      expect((error as Error).message).toBe("Persistence failed: op");
    }
  });

  it("lets an AppError pass through unchanged", async () => {
    const original = new BusinessError("seat taken");
    await expect(guarded("op", failing(original))).rejects.toBe(original);
  });
});
