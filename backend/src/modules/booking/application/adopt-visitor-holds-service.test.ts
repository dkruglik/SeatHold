import { describe, expect, it } from "vitest";
import { AdoptVisitorHoldsService } from "./adopt-visitor-holds-service.js";
import { HoldSeatService } from "./hold-seat-service.js";
import { InMemoryHoldRepository } from "./in-memory-hold-repository.test-support.js";

const T0 = new Date("2026-01-01T12:00:00Z");
const visitor = { kind: "visitor", visitorHash: "v1" } as const;
const user = { kind: "user", userId: "u1" } as const;

function setup() {
  const repo = new InMemoryHoldRepository();
  let reads = 0;
  const clock = { now: () => { reads += 1; return Promise.resolve(T0); } };
  return {
    repo,
    reads: () => reads,
    hold: new HoldSeatService({ holds: repo, clock, holdDurationMinutes: 10, maxSeatsPerHold: 5 }),
    adopt: new AdoptVisitorHoldsService({ holds: repo, clock }),
  };
}

describe("AdoptVisitorHoldsService", () => {
  it("moves the visitor's hold to the user, so the user's next hold joins it, and reads the clock once", async () => {
    const { repo, hold, adopt, reads } = setup();
    repo.seats.set("s1", "available");
    repo.seats.set("s2", "available");
    await hold.hold({ holder: visitor, eventId: "e", seatId: "s1" });
    const before = reads();

    await adopt.adopt({ userId: "u1", visitorHash: "v1" });
    const joined = await hold.hold({ holder: user, eventId: "e", seatId: "s2" });

    expect(reads() - before).toBe(2);
    expect(joined.seatIds).toEqual(["s1", "s2"]);
    expect(repo.holdCount()).toBe(1);
  });

  it("releases the visitor's seats when the user already has a hold for the event", async () => {
    const { repo, hold, adopt } = setup();
    repo.seats.set("s1", "available");
    repo.seats.set("s2", "available");
    const userHold = await hold.hold({ holder: user, eventId: "e", seatId: "s1" });
    await hold.hold({ holder: visitor, eventId: "e", seatId: "s2" });

    await adopt.adopt({ userId: "u1", visitorHash: "v1" });

    expect(repo.seats.get("s2")).toBe("available");
    expect(repo.seats.get("s1")).toBe(userHold.holdId);
  });

  it("is a no-op for a visitor without holds", async () => {
    const { adopt, repo } = setup();

    await adopt.adopt({ userId: "u1", visitorHash: "nobody" });

    expect(repo.holdCount()).toBe(0);
  });
});
