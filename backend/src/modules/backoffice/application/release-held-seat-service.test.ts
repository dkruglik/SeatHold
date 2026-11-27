import { describe, expect, it } from "vitest";
import { ControlledClock } from "../../../shared/time/controlled-clock.js";
import { InvalidSeatRelease, SeatNotFound, SeatNotHeld } from "../domain/errors.js";
import { ReleaseHeldSeatService } from "./release-held-seat-service.js";
import type { SeatReleaseInput, SeatReleaseOutcome, SeatReleaser } from "./ports/seat-releaser.js";

const NOW = new Date("2030-01-01T10:00:00.000Z");
const input = { eventId: "e1", seatId: "s1", adminUserId: "u1", reason: "  Buyer phoned us  " };

function setup(outcome: SeatReleaseOutcome) {
  const calls: SeatReleaseInput[] = [];
  let reads = 0;
  const clock = new ControlledClock(NOW);
  const original = clock.now.bind(clock);
  clock.now = () => { reads += 1; return original(); };
  const releaser: SeatReleaser = { release: (call) => { calls.push(call); return Promise.resolve(outcome); } };
  return { calls, reads: () => reads, service: new ReleaseHeldSeatService({ releaser, clock }) };
}

describe("ReleaseHeldSeatService", () => {
  it("reads the clock once and passes the trimmed reason, the acting admin and now to the releaser", async () => {
    const { service, calls, reads } = setup("released");

    expect(await service.execute(input)).toEqual({ seatId: "s1", eventId: "e1" });

    expect(reads()).toBe(1);
    expect(calls).toEqual([{ eventId: "e1", seatId: "s1", adminUserId: "u1", reason: "Buyer phoned us", now: NOW }]);
  });

  it("answers SeatNotHeld when the seat exists but is not held", async () => {
    await expect(setup("not_held").service.execute(input)).rejects.toBeInstanceOf(SeatNotHeld);
  });

  it("answers SeatNotFound when the seat is not in the event", async () => {
    await expect(setup("not_found").service.execute(input)).rejects.toBeInstanceOf(SeatNotFound);
  });

  it("rejects an invalid reason before touching the releaser", async () => {
    const { service, calls } = setup("released");

    await expect(service.execute({ ...input, reason: "no" })).rejects.toBeInstanceOf(InvalidSeatRelease);

    expect(calls).toEqual([]);
  });
});
