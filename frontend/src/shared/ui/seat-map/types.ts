export type SeatState = "available" | "held" | "sold" | "held_by_me";

export interface SeatMapSeat {
  readonly id: string;
  /** Row label, e.g. "C". */
  readonly row: string;
  /** Seat number within the row, from 1. */
  readonly number: number;
  readonly state: SeatState;
}

export interface SeatMapProps {
  readonly rows: number;
  readonly seatsPerRow: number;
  readonly seats: readonly SeatMapSeat[];
  /** Called for an available seat (to take it) and for my own seat (to give it back). Never for sold or others' seats. */
  readonly onSelect: (seat: SeatMapSeat) => void;
  /** Makes every seat inert, e.g. while a request is in flight. */
  readonly disabled?: boolean;
  /** Price of a seat in the currency's minor unit; with `currency` it is shown in the seat tooltip. */
  readonly priceMinor?: number;
  readonly currency?: string;
}
