import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** The popover's editing state: calendar days (local `YYYY-MM-DD`) and local `HH:mm` times. */
export interface RangeDraft {
  readonly dates: readonly [string | null, string | null];
  readonly fromTime: string;
  readonly toTime: string;
}

export const DEFAULT_FROM_TIME = "00:00";
export const DEFAULT_TO_TIME = "23:59";

export const emptyDraft: RangeDraft = { dates: [null, null], fromTime: DEFAULT_FROM_TIME, toTime: DEFAULT_TO_TIME };

/** Wall-clock date and time of an ISO instant in `zone` (default: the browser's timezone). */
export function draftFromInstants(from: string | null, to: string | null, zone: string = browserTimeZone()): RangeDraft {
  const start = from === null ? null : dayjs(from).tz(zone);
  const end = to === null ? null : dayjs(to).tz(zone);
  return {
    dates: [start?.format("YYYY-MM-DD") ?? null, end?.format("YYYY-MM-DD") ?? null],
    fromTime: start?.format("HH:mm") ?? DEFAULT_FROM_TIME,
    toTime: end?.format("HH:mm") ?? DEFAULT_TO_TIME,
  };
}

/** The wall-clock moment in `zone` as a UTC ISO instant; null when the time text is incomplete. */
export function toInstant(date: string, time: string, zone: string = browserTimeZone()): string | null {
  if (!/^\d{2}:\d{2}$/.test(time) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return dayjs.tz(`${date} ${time}`, zone).toISOString();
}

export function summarize(from: string | null, to: string | null, zone: string = browserTimeZone()): string | null {
  if (from === null && to === null) return null;
  const format = (iso: string | null) => (iso === null ? "…" : dayjs(iso).tz(zone).format("D MMM YYYY HH:mm"));
  return `${format(from)} – ${format(to)}`;
}
