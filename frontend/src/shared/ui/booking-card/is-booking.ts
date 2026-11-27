import type { Booking } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Checks the parts the screens read, so a wrong body is an error in the service, not a crash in a component. */
export function isBooking(value: unknown): value is Booking {
  return (
    isRecord(value) &&
    typeof value.bookingId === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.totalMinor === "number" &&
    typeof value.currency === "string" &&
    isRecord(value.event) &&
    typeof value.event.title === "string" &&
    typeof value.event.startsAt === "string" &&
    typeof value.event.timezone === "string" &&
    Array.isArray(value.tickets) &&
    value.tickets.every((t) => isRecord(t) && typeof t.code === "string" && typeof t.ticketId === "string")
  );
}
