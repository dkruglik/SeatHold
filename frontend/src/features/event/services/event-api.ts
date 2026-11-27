import { ApiError, type ApiClient } from "../../../shared/lib/api-client";
import type { CurrentHold, EventDetail, PublicSeatMap } from "../types";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function isEventDetail(body: unknown): body is EventDetail {
  return (
    isRecord(body) && typeof body.eventId === "string" && typeof body.title === "string" && isRecord(body.venue) &&
    typeof body.startsAt === "string" && typeof body.priceMinor === "number" && typeof body.currency === "string" &&
    typeof body.rows === "number" && typeof body.seatsPerRow === "number" && typeof body.seatsLeft === "number"
  );
}

function isSeatMap(body: unknown): body is PublicSeatMap {
  return isRecord(body) && isRecord(body.event) && Array.isArray(body.seats) && body.seats.every((s) => isRecord(s) && typeof s.id === "string");
}

function isHold(body: unknown): body is CurrentHold {
  return isRecord(body) && Array.isArray(body.seatIds) && typeof body.expiresAt === "string";
}

function checked<T>(body: unknown, guard: (value: unknown) => value is T, route: string): T {
  if (!guard(body)) {
    throw new Error(`Unexpected response from ${route}`);
  }
  return body;
}

/** The event page's endpoints. Responses are checked for their shape, so a wrong body is an error, not a crash in a component. */
export class EventApi {
  constructor(private readonly client: ApiClient) {}

  async event(eventId: string): Promise<EventDetail> {
    return checked(await this.client.get<unknown>(`/events/${eventId}`), isEventDetail, "GET /events/:id");
  }

  async seatMap(eventId: string): Promise<PublicSeatMap> {
    return checked(await this.client.get<unknown>(`/events/${eventId}/seats`), isSeatMap, "GET /events/:id/seats");
  }

  /** The viewer's live hold, or `null` when there is none (404 HOLD_NOT_FOUND, which also covers an expired hold). */
  async currentHold(eventId: string): Promise<CurrentHold | null> {
    try {
      return checked(await this.client.get<unknown>(`/events/${eventId}/hold`), isHold, "GET /events/:id/hold");
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && error.code === "HOLD_NOT_FOUND") {
        return null;
      }
      throw error;
    }
  }

  async hold(eventId: string, seatId: string): Promise<CurrentHold> {
    return checked(await this.client.put<unknown>(`/events/${eventId}/hold/seats/${seatId}`), isHold, "PUT /events/:id/hold/seats/:id");
  }

  async release(eventId: string, seatId: string): Promise<void> {
    await this.client.delete<undefined>(`/events/${eventId}/hold/seats/${seatId}`);
  }
}
