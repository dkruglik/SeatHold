import type { CurrentHold } from "../../application/ports/current-hold-reader.js";
import type { SeatMap } from "../../application/get-seat-map-query.js";

export const eventParamsSchema = {
  type: "object",
  properties: { eventId: { type: "string", format: "uuid" } },
  required: ["eventId"],
} as const;

export interface SeatMapDto {
  readonly event: { readonly id: string; readonly priceMinor: number; readonly currency: string };
  readonly seats: readonly { readonly id: string; readonly row: string; readonly number: number; readonly state: string }[];
}

/** The public seat map as the browser sees it: no hold ids, no holder data. */
export const toSeatMapDto = (map: SeatMap): SeatMapDto => ({
  event: { id: map.eventId, priceMinor: map.priceMinor, currency: map.currency },
  seats: map.seats.map((s) => ({ id: s.seatId, row: s.rowLabel, number: s.seatNumber, state: s.state })),
});

export const seatMapSchema = {
  type: "object",
  properties: {
    event: {
      type: "object",
      properties: { id: { type: "string" }, priceMinor: { type: "integer" }, currency: { type: "string" } },
      required: ["id", "priceMinor", "currency"],
    },
    seats: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, row: { type: "string" }, number: { type: "integer" }, state: { type: "string", enum: ["available", "held", "sold"] } },
        required: ["id", "row", "number", "state"],
      },
    },
  },
  required: ["event", "seats"],
} as const;

export interface CurrentHoldDto {
  readonly seatIds: readonly string[];
  readonly expiresAt: string;
}

export const toCurrentHoldDto = (hold: CurrentHold): CurrentHoldDto => ({ seatIds: hold.seatIds, expiresAt: hold.expiresAt.toISOString() });

export const currentHoldSchema = {
  type: "object",
  properties: { seatIds: { type: "array", items: { type: "string" } }, expiresAt: { type: "string" } },
  required: ["seatIds", "expiresAt"],
} as const;
