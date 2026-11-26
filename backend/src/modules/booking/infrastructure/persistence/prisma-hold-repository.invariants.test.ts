import { describe, expect, it } from "vitest";
import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import { InfrastructureError } from "../../../../shared/errors/app-error.js";
import { holderFrom } from "../../domain/holder.js";
import { PrismaHoldRepository } from "./prisma-hold-repository.js";

/** A transaction whose statements affect and return nothing: the hold never appears after the insert. */
const emptyTx = { $executeRaw: () => Promise.resolve(0), $queryRaw: () => Promise.resolve([]) };
const prismaWith = (tx: unknown): PrismaService =>
  ({ client: { $transaction: (work: (t: unknown) => Promise<unknown>) => work(tx) } }) as unknown as PrismaService;

describe("hold repository invariants", () => {
  it("fails with an InfrastructureError naming the invariant when the active hold is missing after get-or-create", async () => {
    const repository = new PrismaHoldRepository(prismaWith(emptyTx));
    const holder = holderFrom({ visitorHash: "secret-visitor-hash" });

    const failure = await repository
      .inTransaction((tx) => tx.getOrCreateActiveHold(holder, "event-1", new Date(), new Date()))
      .then(() => undefined, (error: unknown) => error);

    expect(failure).toBeInstanceOf(InfrastructureError);
    expect((failure as Error).message).toBe("Invariant broken: no active hold after get-or-create");
    expect((failure as Error).message).not.toContain("secret-visitor-hash");
  });
});
