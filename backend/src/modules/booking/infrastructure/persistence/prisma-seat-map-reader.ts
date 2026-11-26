import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import type { SeatMapReader, StoredSeatMap } from "../../application/ports/seat-map-reader.js";
import type { SeatStatus } from "../../domain/seat-state.js";
import { guarded } from "./persistence-errors.js";

interface Row {
  readonly price_minor: number;
  readonly currency: string;
  readonly id: string | null;
  readonly row_label: string | null;
  readonly seat_number: number | null;
  readonly status: string | null;
  readonly held_until: Date | null;
}

/** One statement: the event with all its seats (hold ids are never selected). The state is derived in the application layer. */
export class PrismaSeatMapReader implements SeatMapReader {
  constructor(private readonly prisma: PrismaService) {}

  read(eventId: string): Promise<StoredSeatMap | undefined> {
    return guarded("read seat map", async () => {
      const rows = await this.prisma.client.$queryRaw<Row[]>`
        SELECT e.price_minor, e.currency, s.id, s.row_label, s.seat_number, s.status, s.held_until
        FROM events e LEFT JOIN seats s ON s.event_id = e.id
        WHERE e.id = ${eventId}::uuid
        ORDER BY s.row_label, s.seat_number`;
      const first = rows[0];
      if (first === undefined) return undefined;
      const seats = rows.flatMap((r) =>
        r.id === null
          ? []
          : [{ seatId: r.id, rowLabel: r.row_label as string, seatNumber: r.seat_number as number, status: r.status as SeatStatus, heldUntil: r.held_until }],
      );
      return { priceMinor: first.price_minor, currency: first.currency, seats };
    });
  }
}
