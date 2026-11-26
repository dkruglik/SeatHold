import type { SeatStatus } from "../../domain/seat-state.js";

/** A seat as stored. Carries no hold id and no holder: nothing here depends on the viewer. */
export interface StoredSeatView {
  readonly seatId: string;
  readonly rowLabel: string;
  readonly seatNumber: number;
  readonly status: SeatStatus;
  readonly heldUntil: Date | null;
}

export interface StoredSeatMap {
  readonly priceMinor: number;
  readonly currency: string;
  readonly seats: readonly StoredSeatView[];
}

/** Read port for the public seat map. One statement; `undefined` when the event does not exist. */
export interface SeatMapReader {
  read(eventId: string): Promise<StoredSeatMap | undefined>;
}
