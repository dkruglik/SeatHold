import { describe, expect, it } from "vitest";
import { HoldLimitReached, HoldNotFound, SeatUnavailable } from "../domain/errors.js";
import { holderFrom } from "../domain/holder.js";
import { HoldSeatService } from "./hold-seat-service.js";
import { InMemoryHoldRepository } from "./in-memory-hold-repository.test-support.js";
import { ReleaseSeatService } from "./release-seat-service.js";

const T0 = new Date("2026-01-01T12:00:00Z");
const holder = holderFrom({ visitorHash: "v1" });

function setup(maxSeatsPerHold = 2) {
  const repo = new InMemoryHoldRepository();
  let reads = 0;
  const clock = { now: () => { reads += 1; return Promise.resolve(T0); } };
  const hold = new HoldSeatService({ holds: repo, clock, holdDurationMinutes: 10, maxSeatsPerHold });
  const release = new ReleaseSeatService({ holds: repo, clock });
  return { repo, hold, release, reads: () => reads };
}

describe("HoldSeatService", () => {
  it("reads the clock once and sets expires_at from it", async () => {
    const { hold, reads, repo } = setup();
    repo.seats.set("s1", "available");

    const result = await hold.hold({ holder, eventId: "e", seatId: "s1" });

    expect(reads()).toBe(1);
    expect(result.expiresAt).toEqual(new Date(T0.getTime() + 600_000));
  });

  it("returns the ids of every seat the hold holds", async () => {
    const { hold, repo } = setup();
    repo.seats.set("s1", "available");
    repo.seats.set("s2", "available");

    await hold.hold({ holder, eventId: "e", seatId: "s1" });
    const result = await hold.hold({ holder, eventId: "e", seatId: "s2" });

    expect(result.seatIds).toEqual(["s1", "s2"]);
  });

  it("rejects with SeatUnavailable and keeps no empty hold when the seat is taken", async () => {
    const { hold, repo } = setup();
    repo.seats.set("s1", "sold");

    await expect(hold.hold({ holder, eventId: "e", seatId: "s1" })).rejects.toBeInstanceOf(SeatUnavailable);
    expect(repo.holdCount()).toBe(0);
  });

  it("rejects the seat past the cap before touching the seat", async () => {
    const { hold, repo } = setup(1);
    repo.seats.set("s1", "available");
    repo.seats.set("s2", "available");
    await hold.hold({ holder, eventId: "e", seatId: "s1" });

    await expect(hold.hold({ holder, eventId: "e", seatId: "s2" })).rejects.toBeInstanceOf(HoldLimitReached);
    expect(repo.seats.get("s2")).toBe("available");
  });
});

describe("ReleaseSeatService", () => {
  it("throws HoldNotFound when the holder has no hold", async () => {
    const { release } = setup();

    await expect(release.release({ holder, eventId: "e", seatId: "s1" })).rejects.toBeInstanceOf(HoldNotFound);
  });

  it("reads the clock once", async () => {
    const { hold, release, repo, reads } = setup();
    repo.seats.set("s1", "available");
    await hold.hold({ holder, eventId: "e", seatId: "s1" });
    const before = reads();

    await release.release({ holder, eventId: "e", seatId: "s1" });

    expect(reads() - before).toBe(1);
  });
});
