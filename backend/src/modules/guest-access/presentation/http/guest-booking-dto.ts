import type { MyBooking } from "../../../booking/index.js";

const str = { type: "string" } as const;

export const guestBookingSchema = {
  type: "object",
  properties: {
    bookingId: str, status: str, createdAt: str, totalMinor: { type: "integer" }, currency: str,
    event: {
      type: "object",
      properties: { eventId: str, title: str, startsAt: str, venueName: str, city: str, timezone: str },
      required: ["eventId", "title", "startsAt", "venueName", "city", "timezone"],
    },
    tickets: {
      type: "array",
      items: {
        type: "object",
        properties: { ticketId: str, code: str, rowLabel: str, seatNumber: { type: "integer" } },
        required: ["ticketId", "code", "rowLabel", "seatNumber"],
      },
    },
  },
  required: ["bookingId", "status", "createdAt", "totalMinor", "currency", "event", "tickets"],
} as const;

/** The guest's one booking, in the same shape as an entry of GET /me/bookings. Ticket codes are never logged. */
export const toGuestBookingDto = (b: MyBooking) => ({
  bookingId: b.bookingId, status: b.status, createdAt: b.createdAt.toISOString(), totalMinor: b.totalMinor, currency: b.currency,
  event: { eventId: b.event.eventId, title: b.event.title, startsAt: b.event.startsAt.toISOString(), venueName: b.event.venueName, city: b.event.city, timezone: b.event.timezone },
  tickets: b.tickets,
});

export const exchangeBodySchema = {
  type: "object",
  properties: { token: { type: "string", minLength: 20, maxLength: 200 } },
  required: ["token"],
  propertyNames: { enum: ["token"] },
  additionalProperties: false,
} as const;

export const resendBodySchema = {
  type: "object",
  properties: { email: { type: "string", format: "email", maxLength: 254 } },
  required: ["email"],
  propertyNames: { enum: ["email"] },
  additionalProperties: false,
} as const;
