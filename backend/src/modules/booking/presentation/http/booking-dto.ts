import type { Booking } from "../../application/ports/checkout-repository.js";
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

export const holdSeatParamsSchema = {
  type: "object",
  properties: { eventId: { type: "string", format: "uuid" }, seatId: { type: "string", format: "uuid" } },
  required: ["eventId", "seatId"],
} as const;

export interface CurrentHoldDto {
  readonly seatIds: readonly string[];
  readonly expiresAt: string;
}

export const toCurrentHoldDto = (hold: Pick<CurrentHold, "seatIds" | "expiresAt">): CurrentHoldDto => ({ seatIds: hold.seatIds, expiresAt: hold.expiresAt.toISOString() });

export const currentHoldSchema = {
  type: "object",
  properties: { seatIds: { type: "array", items: { type: "string" } }, expiresAt: { type: "string" } },
  required: ["seatIds", "expiresAt"],
} as const;

export interface CheckoutBody {
  readonly paymentOutcome: "succeed" | "fail";
  readonly guestEmail?: string;
}

/**
 * Shape only; the email's syntax is a domain rule (GUEST_EMAIL_INVALID). 254 is the longest valid address.
 * Fastify's Ajv strips unknown fields where `additionalProperties` is false, so `propertyNames` is what rejects them with 400.
 */
export const checkoutBodySchema = {
  type: "object",
  properties: { paymentOutcome: { type: "string", enum: ["succeed", "fail"] }, guestEmail: { type: "string", maxLength: 254 } },
  required: ["paymentOutcome"],
  propertyNames: { enum: ["paymentOutcome", "guestEmail"] },
  additionalProperties: false,
} as const;

export const bookingSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    status: { type: "string" },
    eventId: { type: "string" },
    seatIds: { type: "array", items: { type: "string" } },
    tickets: { type: "array", items: { type: "object", properties: { seatId: { type: "string" }, code: { type: "string" } }, required: ["seatId", "code"] } },
    totalMinor: { type: "integer" },
    currency: { type: "string" },
  },
  required: ["id", "status", "eventId", "seatIds", "tickets", "totalMinor", "currency"],
} as const;

/** The booking as the buyer sees it. Ticket codes are shown once here and again to the owner later; never logged. */
export const toBookingDto = (booking: Booking): Booking => ({
  id: booking.id, status: booking.status, eventId: booking.eventId, seatIds: booking.seatIds,
  tickets: booking.tickets.map((t) => ({ seatId: t.seatId, code: t.code })), totalMinor: booking.totalMinor, currency: booking.currency,
});
