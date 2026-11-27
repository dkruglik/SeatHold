import type { NewEventGrid, ShowRef, VenueRef } from "../../catalog/index.js";
import { InvalidEvent } from "./errors.js";

/** The grid limits; they mirror the CHECK constraints on `events` (rows, seats_per_row 1..200, at most 20,000 seats). */
export const MAX_ROWS = 200;
export const MAX_SEATS_PER_ROW = 200;
export const MAX_SEATS = 20_000;
export const MAX_PRICE_MINOR = 1_000_000;
const MAX_YEARS_AHEAD = 3;
const NAME_MAX = 100;
const DESCRIPTION_MAX = 2000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** The body as it arrives: nothing is trusted, so every field is `unknown`-shaped until parsed. */
export interface RawCreateEvent {
  readonly show: { readonly existingId?: unknown; readonly new?: Record<string, unknown> };
  readonly venue: { readonly existingId?: unknown; readonly new?: Record<string, unknown> };
  readonly startsAt: unknown;
  readonly priceMinor: unknown;
  readonly currency: unknown;
  readonly rows: unknown;
  readonly seatsPerRow: unknown;
}

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    throw new InvalidEvent(`${field} must be ${min === max ? `${min}` : `${min} to ${max}`} characters`);
  }
  return value;
}

function letters(value: unknown, field: string, length: number): string {
  if (typeof value !== "string" || !new RegExp(`^[A-Za-z]{${length}}$`).test(value)) {
    throw new InvalidEvent(`${field} must be ${length} letters`);
  }
  return value.toUpperCase();
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new InvalidEvent(`${field} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Exactly one of `existingId` and `new` must be present. */
function pickRef(ref: { existingId?: unknown; new?: Record<string, unknown> } | undefined, field: string): { existingId: string } | { fresh: Record<string, unknown> } {
  const hasId = ref?.existingId !== undefined;
  const hasNew = ref?.new !== undefined;
  if (hasId === hasNew) {
    throw new InvalidEvent(`${field} needs exactly one of existingId and new`);
  }
  if (hasId) {
    if (typeof ref?.existingId !== "string" || !UUID.test(ref.existingId)) throw new InvalidEvent(`${field}.existingId must be a UUID`);
    return { existingId: ref.existingId };
  }
  return { fresh: (ref as { new: Record<string, unknown> }).new };
}

function parseShow(raw: RawCreateEvent["show"]): ShowRef {
  const ref = pickRef(raw, "show");
  if ("existingId" in ref) return ref;
  const f = ref.fresh;
  return { new: { title: text(f.title, "show.title", 1, NAME_MAX), type: text(f.type, "show.type", 1, NAME_MAX), genre: text(f.genre, "show.genre", 1, NAME_MAX), description: text(f.description, "show.description", 0, DESCRIPTION_MAX) } };
}

function parseVenue(raw: RawCreateEvent["venue"]): VenueRef {
  const ref = pickRef(raw, "venue");
  if ("existingId" in ref) return ref;
  const f = ref.fresh;
  const timezone = text(f.timezone, "venue.timezone", 1, NAME_MAX);
  if (!isTimezone(timezone)) throw new InvalidEvent("venue.timezone must be an IANA timezone");
  return { new: { name: text(f.name, "venue.name", 1, NAME_MAX), city: text(f.city, "venue.city", 1, NAME_MAX), countryCode: letters(f.countryCode, "venue.countryCode", 2), timezone } };
}

/** An ISO 8601 instant (date, time and offset) after `now` and at most three years ahead. */
function parseStartsAt(value: unknown, now: Date): Date {
  const startsAt = typeof value === "string" && ISO_INSTANT.test(value) ? new Date(value) : new Date(Number.NaN);
  const limit = new Date(now);
  limit.setUTCFullYear(limit.getUTCFullYear() + MAX_YEARS_AHEAD);
  if (Number.isNaN(startsAt.getTime()) || startsAt <= now || startsAt > limit) {
    throw new InvalidEvent(`startsAt must be an ISO instant in the future, at most ${MAX_YEARS_AHEAD} years ahead`);
  }
  return startsAt;
}

/** Validates the raw input against the bounds and returns the normalised event; throws InvalidEvent. `now` is the operation's single clock read. */
export function parseCreateEvent(raw: RawCreateEvent, now: Date): NewEventGrid {
  const show = parseShow(raw.show);
  const venue = parseVenue(raw.venue);
  const startsAt = parseStartsAt(raw.startsAt, now);
  const priceMinor = integer(raw.priceMinor, "priceMinor", 0, MAX_PRICE_MINOR);
  const currency = letters(raw.currency, "currency", 3);
  const rows = integer(raw.rows, "rows", 1, MAX_ROWS);
  const seatsPerRow = integer(raw.seatsPerRow, "seatsPerRow", 1, MAX_SEATS_PER_ROW);
  if (rows * seatsPerRow > MAX_SEATS) {
    throw new InvalidEvent(`rows times seatsPerRow must be at most ${MAX_SEATS}`);
  }
  return { show, venue, startsAt, priceMinor, currency, rows, seatsPerRow };
}
