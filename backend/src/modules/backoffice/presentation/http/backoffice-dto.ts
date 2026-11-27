import type { CreatedEvent } from "../../../catalog/index.js";

const showNewSchema = {
  type: "object",
  properties: { title: { type: "string", maxLength: 100 }, type: { type: "string", maxLength: 100 }, genre: { type: "string", maxLength: 100 }, description: { type: "string", maxLength: 2000 } },
  required: ["title", "type", "genre", "description"],
  propertyNames: { enum: ["title", "type", "genre", "description"] },
  additionalProperties: false,
} as const;

const venueNewSchema = {
  type: "object",
  properties: { name: { type: "string", maxLength: 100 }, city: { type: "string", maxLength: 100 }, countryCode: { type: "string", maxLength: 2 }, timezone: { type: "string", maxLength: 100 } },
  required: ["name", "city", "countryCode", "timezone"],
  propertyNames: { enum: ["name", "city", "countryCode", "timezone"] },
  additionalProperties: false,
} as const;

const refSchema = (fresh: object) =>
  ({
    type: "object",
    properties: { existingId: { type: "string", format: "uuid" }, new: fresh },
    propertyNames: { enum: ["existingId", "new"] },
    additionalProperties: false,
  }) as const;

/**
 * Shape only; the bounds and the exactly-one-of rules are domain rules (INVALID_EVENT). Fastify's Ajv strips unknown
 * fields where `additionalProperties` is false, so `propertyNames` is what rejects them with 400.
 */
export const createEventBodySchema = {
  type: "object",
  properties: {
    show: refSchema(showNewSchema),
    venue: refSchema(venueNewSchema),
    startsAt: { type: "string", maxLength: 40 },
    priceMinor: { type: "integer" },
    currency: { type: "string", maxLength: 3 },
    rows: { type: "integer" },
    seatsPerRow: { type: "integer" },
  },
  required: ["show", "venue", "startsAt", "priceMinor", "currency", "rows", "seatsPerRow"],
  propertyNames: { enum: ["show", "venue", "startsAt", "priceMinor", "currency", "rows", "seatsPerRow"] },
  additionalProperties: false,
} as const;

export interface CreatedEventDto {
  readonly eventId: string;
  readonly showId: string;
  readonly venueId: string;
  readonly title: string;
  readonly startsAt: string;
  readonly priceMinor: number;
  readonly currency: string;
  readonly rows: number;
  readonly seatsPerRow: number;
  readonly seatCount: number;
}

export const toCreatedEventDto = (event: CreatedEvent): CreatedEventDto => ({ ...event, startsAt: event.startsAt.toISOString() });

export const createdEventSchema = {
  type: "object",
  properties: {
    eventId: { type: "string" },
    showId: { type: "string" },
    venueId: { type: "string" },
    title: { type: "string" },
    startsAt: { type: "string" },
    priceMinor: { type: "integer" },
    currency: { type: "string" },
    rows: { type: "integer" },
    seatsPerRow: { type: "integer" },
    seatCount: { type: "integer" },
  },
  required: ["eventId", "showId", "venueId", "title", "startsAt", "priceMinor", "currency", "rows", "seatsPerRow", "seatCount"],
} as const;

/** The app-wide error body, documented for the 409 VENUE_CONFLICT answer. */
export const conflictSchema = {
  type: "object",
  properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } }, required: ["code", "message"] } },
  required: ["error"],
} as const;
