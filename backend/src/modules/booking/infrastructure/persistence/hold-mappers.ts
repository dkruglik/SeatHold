import type { ActiveHold } from "../../application/ports/hold-repository.js";
import type { Holder } from "../../domain/holder.js";

export interface ActiveHoldRow {
  readonly id: string;
  readonly expires_at: Date;
  readonly seat_count: number;
}

export function toActiveHold(row: ActiveHoldRow): ActiveHold {
  return { id: row.id, expiresAt: row.expires_at, seatCount: row.seat_count };
}

/** Column values of the holder: exactly one is non-null (the `holds` CHECK). */
export function holderColumns(holder: Holder): { userId: string | null; visitorHash: string | null } {
  return holder.kind === "user" ? { userId: holder.userId, visitorHash: null } : { userId: null, visitorHash: holder.visitorHash };
}
