import { describe, expect, it } from "vitest";
import { EventNotFound, HoldNotFound } from "../domain/errors.js";
import { holderFrom } from "../domain/holder.js";
import { ExpireHoldsService } from "./expire-holds-service.js";
import { GetCurrentHoldQuery } from "./get-current-hold-query.js";
import { GetSeatMapQuery } from "./get-seat-map-query.js";
import type { HoldSweeper } from "./ports/hold-sweeper.js";
import type { SeatMapReader } from "./ports/seat-map-reader.js";

const NOW = new Date("2026-01-01T12:00:00Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);

function countingClock() {
  let reads = 0;
  return { clock: { now: () => { reads += 1; return Promise.resolve(NOW); } }, reads: () => reads };
}

describe("GetSeatMapQuery", () => {
  const reader: SeatMapReader = {
    read: (eventId) =>
      Promise.resolve(
        eventId === "e1"
          ? {
              priceMinor: 5000,
              currency: "EUR",
              seats: [
                { seatId: "s1", rowLabel: "A", seatNumber: 1, status: "held" as const, heldUntil: later(-1) },
                { seatId: "s2", rowLabel: "A", seatNumber: 2, status: "held" as const, heldUntil: later(1) },
                { seatId: "s3", rowLabel: "A", seatNumber: 3, status: "sold" as const, heldUntil: null },
                { seatId: "s4", rowLabel: "A", seatNumber: 4, status: "available" as const, heldUntil: null },
              ],
            }
          : undefined,
      ),
  };

  it("shows an expired hold as available, reads the clock once and exposes no hold data", async () => {
    const { clock, reads } = countingClock();

    const map = await new GetSeatMapQuery({ reader, clock }).execute({ eventId: "e1" });

    expect(map.seats.map((s) => s.state)).toEqual(["available", "held", "sold", "available"]);
    expect(reads()).toBe(1);
    expect(JSON.stringify(map)).not.toMatch(/hold|until/i);
    expect(map.priceMinor).toBe(5000);
  });

  it("throws EventNotFound for an unknown event", async () => {
    await expect(new GetSeatMapQuery({ reader, clock: countingClock().clock }).execute({ eventId: "nope" })).rejects.toBeInstanceOf(EventNotFound);
  });
});

describe("GetCurrentHoldQuery", () => {
  const holder = holderFrom({ visitorHash: "v1" });

  it("returns seats and expiresAt, passing the clock value to the reader", async () => {
    let seenNow: Date | undefined;
    const holds = { findActive: (_h: unknown, _e: string, now: Date) => { seenNow = now; return Promise.resolve({ holdId: "h1", expiresAt: later(1000), seatIds: ["s1"] }); } };
    const { clock, reads } = countingClock();

    const result = await new GetCurrentHoldQuery({ holds, clock }).execute({ holder, eventId: "e1" });

    expect(result).toEqual({ holdId: "h1", expiresAt: later(1000), seatIds: ["s1"] });
    expect(seenNow).toEqual(NOW);
    expect(reads()).toBe(1);
  });

  it("throws HoldNotFound when there is no live hold", async () => {
    const holds = { findActive: () => Promise.resolve(undefined) };
    await expect(new GetCurrentHoldQuery({ holds, clock: countingClock().clock }).execute({ holder, eventId: "e1" })).rejects.toBeInstanceOf(HoldNotFound);
  });
});

describe("ExpireHoldsService", () => {
  function sweeperWith(expiredSeats: number) {
    let remaining = expiredSeats;
    const calls: number[] = [];
    const sweeper: HoldSweeper = {
      freeExpiredSeats: (_now, limit) => { const n = Math.min(limit, remaining); remaining -= n; calls.push(n); return Promise.resolve(n); },
      expireEmptyHolds: () => Promise.resolve(0),
    };
    return { sweeper, calls };
  }

  it("loops in bounded batches until a batch is short, reading the clock once", async () => {
    const { sweeper, calls } = sweeperWith(25);
    const { clock, reads } = countingClock();

    const result = await new ExpireHoldsService({ sweeper, clock }).sweep({ batchSize: 10 });

    expect(calls).toEqual([10, 10, 5]);
    expect(result.freedSeats).toBe(25);
    expect(reads()).toBe(1);
  });

  it("stops after one call when nothing is expired", async () => {
    const { sweeper, calls } = sweeperWith(0);
    await new ExpireHoldsService({ sweeper, clock: countingClock().clock }).sweep({ batchSize: 10 });
    expect(calls).toEqual([0]);
  });

  it("rejects a non-positive batch size", async () => {
    const { sweeper } = sweeperWith(0);
    await expect(new ExpireHoldsService({ sweeper, clock: countingClock().clock }).sweep({ batchSize: 0 })).rejects.toThrow();
  });
});
