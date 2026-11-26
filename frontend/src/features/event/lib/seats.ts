import type { SeatMapSeat } from "../../../shared/ui/seat-map";
import type { PublicSeatMap } from "../types";

/** The public states, with the seats of my hold (known from the hold route) marked `held_by_me`. */
export function toMapSeats(map: PublicSeatMap, mySeatIds: readonly string[]): SeatMapSeat[] {
  const mine = new Set(mySeatIds);
  return map.seats.map((seat) => ({ id: seat.id, row: seat.row, number: seat.number, state: mine.has(seat.id) ? "held_by_me" : seat.state }));
}

export function seatLabel(seat: Pick<SeatMapSeat, "row" | "number">): string {
  return `Row ${seat.row}, seat ${seat.number}`;
}
