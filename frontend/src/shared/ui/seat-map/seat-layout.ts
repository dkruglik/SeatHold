import { markerSize } from "./seat-tokens";
import type { SeatMapSeat } from "./types";

export const pitch = 32;
export const labelWidth = 28;

export type SeatRow = readonly [label: string, seats: readonly SeatMapSeat[]];

/** Rows in first-seen order, the seats of each row ordered by number. */
export function groupByRow(seats: readonly SeatMapSeat[]): SeatRow[] {
  const rows = new Map<string, SeatMapSeat[]>();
  for (const seat of seats) {
    const rowSeats = rows.get(seat.row);
    if (rowSeats === undefined) {
      rows.set(seat.row, [seat]);
    } else {
      rowSeats.push(seat);
    }
  }
  return [...rows].map(([label, rowSeats]) => [label, rowSeats.sort((a, b) => a.number - b.number)]);
}

export function seatX(seat: SeatMapSeat): number {
  return labelWidth + (seat.number - 1) * pitch;
}

export function rowY(rowIndex: number): number {
  return rowIndex * pitch;
}

export function rowCenterY(rowIndex: number): number {
  return rowY(rowIndex) + markerSize / 2;
}

function nearest(row: SeatRow | undefined, number: number): SeatMapSeat | undefined {
  return row?.[1].reduce<SeatMapSeat | undefined>(
    (best, seat) => (best === undefined || Math.abs(seat.number - number) < Math.abs(best.number - number) ? seat : best),
    undefined,
  );
}

/** The seat a navigation key leads to from the current seat, or null when the key leads nowhere. */
export function nextSeatId(rows: readonly SeatRow[], currentId: string, key: string): string | null {
  const rowIndex = rows.findIndex(([, seats]) => seats.some((s) => s.id === currentId));
  const row = rows[rowIndex];
  if (row === undefined) {
    return null;
  }
  const seats = row[1];
  const index = seats.findIndex((s) => s.id === currentId);
  const number = seats[index]?.number ?? 0;
  const targets: Record<string, SeatMapSeat | undefined> = {
    ArrowLeft: seats[index - 1],
    ArrowRight: seats[index + 1],
    Home: seats[0],
    End: seats[seats.length - 1],
    ArrowUp: nearest(rows[rowIndex - 1], number),
    ArrowDown: nearest(rows[rowIndex + 1], number),
    PageUp: rowIndex > 0 ? nearest(rows[0], number) : undefined,
    PageDown: rowIndex < rows.length - 1 ? nearest(rows[rows.length - 1], number) : undefined,
  };
  return Object.hasOwn(targets, key) ? (targets[key]?.id ?? null) : null;
}
