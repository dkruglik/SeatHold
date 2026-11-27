import { describe, expect, it } from "vitest";
import { groupByRow, nextSeatId } from "./seat-layout";
import type { SeatMapSeat } from "./types";

const seat = (row: string, number: number): SeatMapSeat => ({ id: `${row}${number}`, row, number, state: "available" });
// Row B has a gap at 2.
const rows = groupByRow([seat("A", 1), seat("A", 2), seat("A", 3), seat("A", 4), seat("B", 1), seat("B", 3), seat("B", 4), seat("C", 1), seat("C", 2), seat("C", 3), seat("C", 4)]);

describe("nextSeatId", () => {
  it("moves left and right within a row, skipping gaps and staying in bounds", () => {
    expect(nextSeatId(rows, "A2", "ArrowRight")).toBe("A3");
    expect(nextSeatId(rows, "B1", "ArrowRight")).toBe("B3");
    expect(nextSeatId(rows, "B3", "ArrowLeft")).toBe("B1");
    expect(nextSeatId(rows, "A1", "ArrowLeft")).toBeNull();
    expect(nextSeatId(rows, "A4", "ArrowRight")).toBeNull();
  });

  it("moves up and down keeping the nearest column and stays in bounds", () => {
    expect(nextSeatId(rows, "A3", "ArrowDown")).toBe("B3");
    expect(nextSeatId(rows, "A2", "ArrowDown")).toBe("B1");
    expect(nextSeatId(rows, "B4", "ArrowDown")).toBe("C4");
    expect(nextSeatId(rows, "A1", "ArrowUp")).toBeNull();
    expect(nextSeatId(rows, "C1", "ArrowDown")).toBeNull();
  });

  it("jumps with Home, End, PageUp and PageDown", () => {
    expect(nextSeatId(rows, "B3", "Home")).toBe("B1");
    expect(nextSeatId(rows, "B3", "End")).toBe("B4");
    expect(nextSeatId(rows, "B3", "PageUp")).toBe("A3");
    expect(nextSeatId(rows, "B3", "PageDown")).toBe("C3");
  });

  it("returns null for an unknown seat or key", () => {
    expect(nextSeatId(rows, "Z9", "ArrowRight")).toBeNull();
    expect(nextSeatId(rows, "A1", "x")).toBeNull();
  });
});
