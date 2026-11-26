import type { Clock } from "../../../shared/time/clock.js";
import { EventNotFound } from "../domain/errors.js";
import { publicSeatState, type PublicSeatState } from "../domain/seat-state.js";
import type { SeatMapReader } from "./ports/seat-map-reader.js";

export interface SeatMapSeat {
  readonly seatId: string;
  readonly rowLabel: string;
  readonly seatNumber: number;
  readonly state: PublicSeatState;
}

export interface SeatMap {
  readonly eventId: string;
  readonly priceMinor: number;
  readonly currency: string;
  readonly seats: readonly SeatMapSeat[];
}

/** Public seat map (plan flow 3): the same for every viewer, so the query takes no holder. */
export class GetSeatMapQuery {
  constructor(private readonly deps: { readonly reader: SeatMapReader; readonly clock: Clock }) {}

  async execute(input: { eventId: string }): Promise<SeatMap> {
    const now = await this.deps.clock.now();
    const stored = await this.deps.reader.read(input.eventId);
    if (stored === undefined) throw new EventNotFound();
    return {
      eventId: input.eventId,
      priceMinor: stored.priceMinor,
      currency: stored.currency,
      seats: stored.seats.map((s) => ({ seatId: s.seatId, rowLabel: s.rowLabel, seatNumber: s.seatNumber, state: publicSeatState(s, now) })),
    };
  }
}
