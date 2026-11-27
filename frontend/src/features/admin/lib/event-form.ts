import type { CreateEventRequest, Lookups } from "../types";
import { isTimezone } from "./timezones";

export const NEW = "__new__";
export const MAX_SEATS = 20_000;
const MAX_PRICE_MINOR = 1_000_000;
const MAX_YEARS_AHEAD = 3;

export interface EventFormValues {
  show: string; showTitle: string; showType: string; showGenre: string; showDescription: string;
  venue: string; venueName: string; venueCity: string; venueCountry: string; venueTimezone: string;
  startsAt: string; price: string; currency: string; rows: string; seatsPerRow: string;
}

export type FieldName = keyof EventFormValues;
export type FieldErrors = Partial<Record<FieldName, string>>;

export const initialValues: EventFormValues = {
  show: "", showTitle: "", showType: "", showGenre: "", showDescription: "",
  venue: "", venueName: "", venueCity: "", venueCountry: "", venueTimezone: "",
  startsAt: "", price: "", currency: "EUR", rows: "", seatsPerRow: "",
};

/** Field order on screen, used to focus the first invalid field. */
export const fieldOrder: readonly FieldName[] = [
  "show", "showTitle", "showType", "showGenre", "showDescription",
  "venue", "venueName", "venueCity", "venueCountry", "venueTimezone",
  "startsAt", "price", "currency", "rows", "seatsPerRow",
];

const wholeNumber = (text: string): number | undefined => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : undefined);

export function totalSeats(values: Pick<EventFormValues, "rows" | "seatsPerRow">): number {
  return (wholeNumber(values.rows) ?? 0) * (wholeNumber(values.seatsPerRow) ?? 0);
}

function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** "45.50" in EUR is 4550. Undefined for anything that is not a plain non-negative amount within the currency's decimals. */
export function toMinor(price: string, currency: string): number | undefined {
  const digits = currencyDigits(currency);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(price.trim());
  if (match === null || (match[2]?.length ?? 0) > digits) {
    return undefined;
  }
  return Number(match[1]) * 10 ** digits + Number((match[2] ?? "").padEnd(digits, "0") || 0);
}

function required(errors: FieldErrors, field: FieldName, label: string, value: string, max: number): void {
  if (value.trim() === "" || value.length > max) {
    errors[field] = `${label} is required, up to ${max} characters`;
  }
}

function checkShow(v: EventFormValues, errors: FieldErrors): void {
  if (v.show === "") {
    errors.show = "Choose a show or create a new one";
  } else if (v.show === NEW) {
    required(errors, "showTitle", "Title", v.showTitle, 100);
    required(errors, "showType", "Type", v.showType, 100);
    required(errors, "showGenre", "Genre", v.showGenre, 100);
    if (v.showDescription.length > 2000) {
      errors.showDescription = "Description is at most 2000 characters";
    }
  }
}

function checkVenue(v: EventFormValues, errors: FieldErrors): void {
  if (v.venue === "") {
    errors.venue = "Choose a venue or create a new one";
  } else if (v.venue === NEW) {
    required(errors, "venueName", "Venue name", v.venueName, 100);
    required(errors, "venueCity", "City", v.venueCity, 100);
    if (!/^[A-Za-z]{2}$/.test(v.venueCountry)) {
      errors.venueCountry = "Country code must be 2 letters";
    }
    if (!isTimezone(v.venueTimezone.trim())) {
      errors.venueTimezone = "Time zone must be an IANA zone, for example Europe/Berlin";
    }
  }
}

function checkStart(v: EventFormValues, errors: FieldErrors, now: Date): void {
  const start = new Date(v.startsAt);
  const limit = new Date(now);
  limit.setFullYear(limit.getFullYear() + MAX_YEARS_AHEAD);
  if (v.startsAt === "" || Number.isNaN(start.getTime())) {
    errors.startsAt = "Start is required";
  } else if (start <= now) {
    errors.startsAt = "Start must be in the future";
  } else if (start > limit) {
    errors.startsAt = `Start must be within ${MAX_YEARS_AHEAD} years`;
  }
}

function checkGrid(v: EventFormValues, errors: FieldErrors): void {
  const currency = v.currency.trim();
  if (!/^[A-Za-z]{3}$/.test(currency)) {
    errors.currency = "Currency must be 3 letters";
  }
  const minor = toMinor(v.price, currency);
  if (minor === undefined) {
    errors.price = "Price must be a number such as 45.50, not negative, within the currency's decimals";
  } else if (minor > MAX_PRICE_MINOR) {
    errors.price = `Price must be at most ${MAX_PRICE_MINOR / 10 ** currencyDigits(currency)}`;
  }
  for (const [field, label, text] of [["rows", "Rows", v.rows], ["seatsPerRow", "Seats per row", v.seatsPerRow]] as const) {
    const n = wholeNumber(text);
    if (n === undefined || n < 1 || n > 200) {
      errors[field] = `${label} must be a whole number from 1 to 200`;
    }
  }
  if (errors.rows === undefined && errors.seatsPerRow === undefined && totalSeats(v) > MAX_SEATS) {
    errors.seatsPerRow = `A grid has at most ${MAX_SEATS.toLocaleString("en")} seats`;
  }
}

export function validate(values: EventFormValues, now: Date): FieldErrors {
  const errors: FieldErrors = {};
  checkShow(values, errors);
  checkVenue(values, errors);
  checkStart(values, errors, now);
  checkGrid(values, errors);
  return errors;
}

/** Only called with values that passed `validate`. */
export function toRequest(v: EventFormValues): CreateEventRequest {
  const currency = v.currency.trim().toUpperCase();
  return {
    show: v.show === NEW ? { new: { title: v.showTitle.trim(), type: v.showType.trim(), genre: v.showGenre.trim(), description: v.showDescription } } : { existingId: v.show },
    venue: v.venue === NEW
      ? { new: { name: v.venueName.trim(), city: v.venueCity.trim(), countryCode: v.venueCountry.trim().toUpperCase(), timezone: v.venueTimezone.trim() } }
      : { existingId: v.venue },
    startsAt: new Date(v.startsAt).toISOString(),
    priceMinor: toMinor(v.price, currency) ?? 0,
    currency,
    rows: Number(v.rows),
    seatsPerRow: Number(v.seatsPerRow),
  };
}

/** The zone the typed or chosen venue plays in, for the start-time preview. */
export function venueZone(v: EventFormValues, lookups: Lookups): string | undefined {
  return v.venue === NEW ? (isTimezone(v.venueTimezone.trim()) ? v.venueTimezone.trim() : undefined) : lookups.venues.find((venue) => venue.id === v.venue)?.timezone;
}
