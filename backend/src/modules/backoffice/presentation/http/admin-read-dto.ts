import type { Paged } from "../../application/page.js";
import type { BoughtTickets } from "../../application/list-bought-tickets-query.js";
import type { OpenTickets } from "../../application/list-open-tickets-query.js";
import type { AdminEventRow, EventHeader } from "../../application/ports/admin-readers.js";

const pagingProperties = { total: { type: "integer" }, page: { type: "integer" }, pageSize: { type: "integer" }, totalPages: { type: "integer" } } as const;
const pagingRequired = ["total", "page", "pageSize", "totalPages"] as const;

/** Query shape for the admin lists. `propertyNames` rejects unknown parameters with 400 (Ajv would strip them otherwise). */
export const pageQuerySchema = (defaultPageSize: number) =>
  ({
    type: "object",
    properties: {
      page: { type: "integer", minimum: 1, maximum: 100000, default: 1 },
      pageSize: { type: "integer", minimum: 1, maximum: 100, default: defaultPageSize },
    },
    propertyNames: { enum: ["page", "pageSize"] },
    additionalProperties: false,
  }) as const;

export interface PageQuery {
  readonly page: number;
  readonly pageSize: number;
}

export const eventIdParamsSchema = {
  type: "object",
  properties: { eventId: { type: "string", format: "uuid" } },
  required: ["eventId"],
} as const;

const str = { type: "string" } as const;
const int = { type: "integer" } as const;

const eventHeaderSchema = {
  type: "object",
  properties: { eventId: str, showTitle: str, startsAt: str, venueName: str, city: str, timezone: str },
  required: ["eventId", "showTitle", "startsAt", "venueName", "city", "timezone"],
} as const;

const header = (event: EventHeader) => ({
  eventId: event.eventId, showTitle: event.showTitle, startsAt: event.startsAt.toISOString(),
  venueName: event.venueName, city: event.city, timezone: event.timezone,
});
const paging = (p: Paged<unknown>) => ({ total: p.total, page: p.page, pageSize: p.pageSize, totalPages: p.totalPages });

export const adminEventListSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          eventId: str, showTitle: str, venueName: str, city: str, timezone: str, startsAt: str, priceMinor: int, currency: str,
          rows: int, seatsPerRow: int, seatCount: int, sold: int, held: int, available: int,
        },
        required: ["eventId", "showTitle", "venueName", "city", "timezone", "startsAt", "priceMinor", "currency", "rows", "seatsPerRow", "seatCount", "sold", "held", "available"],
      },
    },
    ...pagingProperties,
  },
  required: ["items", ...pagingRequired],
} as const;

export const toAdminEventListDto = (result: Paged<AdminEventRow>) => ({
  items: result.items.map((e) => ({ ...e, startsAt: e.startsAt.toISOString(), seatCount: e.rows * e.seatsPerRow })),
  ...paging(result),
});

export const lookupsSchema = {
  type: "object",
  properties: {
    shows: { type: "array", items: { type: "object", properties: { id: str, title: str, type: str, genre: str }, required: ["id", "title", "type", "genre"] } },
    venues: {
      type: "array",
      items: { type: "object", properties: { id: str, name: str, city: str, countryCode: str, timezone: str }, required: ["id", "name", "city", "countryCode", "timezone"] },
    },
  },
  required: ["shows", "venues"],
} as const;

export const openTicketsSchema = {
  type: "object",
  properties: {
    event: eventHeaderSchema,
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { seatId: str, row: str, number: int, state: { type: "string", enum: ["available", "held"] }, heldUntil: { type: ["string", "null"] }, releasable: { type: "boolean" } },
        required: ["seatId", "row", "number", "state", "heldUntil", "releasable"],
      },
    },
    ...pagingProperties,
  },
  required: ["event", "items", ...pagingRequired],
} as const;

export const toOpenTicketsDto = (result: OpenTickets) => ({
  event: header(result.event),
  items: result.items.map((t) => ({ ...t, heldUntil: t.heldUntil === null ? null : t.heldUntil.toISOString() })),
  ...paging(result),
});

export const boughtTicketsSchema = {
  type: "object",
  properties: {
    event: eventHeaderSchema,
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ticketId: str, row: str, number: int, buyerEmail: str, buyerType: { type: "string", enum: ["user", "guest"] }, bookedAt: str,
          bookingStatus: { type: "string", enum: ["confirmed"] },
        },
        required: ["ticketId", "row", "number", "buyerEmail", "buyerType", "bookedAt", "bookingStatus"],
      },
    },
    ...pagingProperties,
  },
  required: ["event", "items", ...pagingRequired],
} as const;

export const toBoughtTicketsDto = (result: BoughtTickets) => ({
  event: header(result.event),
  items: result.items.map((t) => ({ ...t, bookedAt: t.bookedAt.toISOString(), bookingStatus: "confirmed" as const })),
  ...paging(result),
});
