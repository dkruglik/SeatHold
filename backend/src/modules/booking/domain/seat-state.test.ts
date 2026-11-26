import { describe, expect, it } from "vitest";
import { publicSeatState } from "./seat-state.js";

const now = new Date("2026-01-01T12:00:00.000Z");
const at = (offsetMs: number): Date => new Date(now.getTime() + offsetMs);

describe("publicSeatState", () => {
  it("shows an available seat as available", () => {
    expect(publicSeatState({ status: "available", heldUntil: null }, now)).toBe("available");
  });

  it("shows a sold seat as sold", () => {
    expect(publicSeatState({ status: "sold", heldUntil: null }, now)).toBe("sold");
  });

  it("one second before expires_at the seat is still held", () => {
    expect(publicSeatState({ status: "held", heldUntil: at(1000) }, now)).toBe("held");
  });

  it("at exactly expires_at the hold is expired and the seat shows as available", () => {
    expect(publicSeatState({ status: "held", heldUntil: now }, now)).toBe("available");
  });

  it("an expired hold shows as available", () => {
    expect(publicSeatState({ status: "held", heldUntil: at(-1000) }, now)).toBe("available");
  });
});
