import type { Clock } from "../../../shared/time/clock.js";
import type { HoldSweeper } from "./ports/hold-sweeper.js";

export interface SweepResult {
  readonly freedSeats: number;
  readonly expiredHolds: number;
}

/**
 * Optional sweeper (plan flow 8). Reads and the hold path already treat expired holds as available,
 * so nothing depends on it. One clock read per sweep; bounded batches; idempotent; safe on many instances.
 */
export class ExpireHoldsService {
  constructor(private readonly deps: { readonly sweeper: HoldSweeper; readonly clock: Clock }) {}

  async sweep(input: { batchSize: number }): Promise<SweepResult> {
    const { batchSize } = input;
    if (!Number.isInteger(batchSize) || batchSize < 1) throw new RangeError("batchSize must be a positive integer");
    const now = await this.deps.clock.now();
    const { sweeper } = this.deps;
    const freedSeats = await drain((limit) => sweeper.freeExpiredSeats(now, limit), batchSize);
    const expiredHolds = await drain((limit) => sweeper.expireEmptyHolds(now, limit), batchSize);
    return { freedSeats, expiredHolds };
  }
}

/** Repeats a bounded batch until one frees fewer rows than the batch size. */
async function drain(batch: (limit: number) => Promise<number>, batchSize: number): Promise<number> {
  let total = 0;
  for (;;) {
    const done = await batch(batchSize);
    total += done;
    if (done < batchSize) return total;
  }
}
