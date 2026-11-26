import { describe, expect, it } from "vitest";
import { ControlledClock } from "./controlled-clock.js";

describe("ControlledClock", () => {
  it("returns the time it was created with until told otherwise", async () => {
    const clock = new ControlledClock(new Date("2030-01-01T10:00:00.000Z"));

    expect((await clock.now()).toISOString()).toBe("2030-01-01T10:00:00.000Z");
    expect((await clock.now()).toISOString()).toBe("2030-01-01T10:00:00.000Z");
  });

  it("advances by the given milliseconds", async () => {
    const clock = new ControlledClock(new Date("2030-01-01T10:00:00.000Z"));

    clock.advance(90_000);

    expect((await clock.now()).toISOString()).toBe("2030-01-01T10:01:30.000Z");
  });

  it("jumps to a set time", async () => {
    const clock = new ControlledClock(new Date("2030-01-01T10:00:00.000Z"));

    clock.set(new Date("2031-06-15T00:00:00.000Z"));

    expect((await clock.now()).toISOString()).toBe("2031-06-15T00:00:00.000Z");
  });

  it("is not changed by mutating a returned date", async () => {
    const clock = new ControlledClock(new Date("2030-01-01T10:00:00.000Z"));

    (await clock.now()).setFullYear(1999);

    expect((await clock.now()).toISOString()).toBe("2030-01-01T10:00:00.000Z");
  });
});
