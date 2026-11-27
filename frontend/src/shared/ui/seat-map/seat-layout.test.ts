import { describe, expect, it } from "vitest";
import { groupByRow, nextSeatId } from "./seat-layout";
import type { SeatMapSeat } from "./types";

const seat = (row: string, number: number): SeatMapSeat => ({ id: `${row}${number}`, row, number, state: "available" });
// Row B has a gap at 2.
const rows = groupByRow([seat("A", 1), seat("A", 2), seat("A", 3), seat("A", 4), seat("B", 1), seat("B", 3), seat("B", 4), seat("C", 1), seat("C", 2), seat("C", 3), seat("C", 4)]);

describe("groupByRow", () => {
  it("keeps rows in first-seen order and sorts each row by seat number", () => {
    const grouped = groupByRow([seat("B", 3), seat("B", 1), seat("A", 2), seat("A", 1), seat("B", 2)]);
    expect(grouped.map(([label, seats]) => [label, seats.map((s) => s.number)])).toEqual([
      ["B", [1, 2, 3]],
      ["A", [1, 2]],
    ]);
  });

  it("groups seats interleaved row by row", () => {
    const input = [3, 1, 2].flatMap((n) => ["A", "B", "C"].map((r) => seat(r, n)));
    const grouped = groupByRow(input);
    expect(grouped.map(([label]) => label)).toEqual(["A", "B", "C"]);
    for (const [, seats] of grouped) {
      expect(seats.map((s) => s.number)).toEqual([1, 2, 3]);
    }
  });

  it("does not modify its input", () => {
    const input = [seat("A", 2), seat("A", 1)];
    groupByRow(input);
    expect(input.map((s) => s.number)).toEqual([2, 1]);
  });

  it("groups a 200-seat row and a 100 x 200 grid completely", () => {
    const reversed = Array.from({ length: 200 }, (_, i) => seat("A", 200 - i));
    expect(groupByRow(reversed)[0]?.[1].map((s) => s.number)).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));

    const grid = Array.from({ length: 200 }, (_, n) => Array.from({ length: 100 }, (_, r) => seat(`R${r}`, 200 - n))).flat();
    const grouped = groupByRow(grid);
    expect(grouped).toHaveLength(100);
    expect(grouped.every(([, seats]) => seats.length === 200 && seats[0]?.number === 1 && seats[199]?.number === 200)).toBe(true);
  });
});

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
