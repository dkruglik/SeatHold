import dayjs from "dayjs";

/** The popover's editing state: calendar days (local `YYYY-MM-DD`) and local `HH:mm` times. */
export interface RangeDraft {
  readonly dates: readonly [string | null, string | null];
  readonly fromTime: string;
  readonly toTime: string;
}

export const DEFAULT_FROM_TIME = "00:00";
export const DEFAULT_TO_TIME = "23:59";

export const emptyDraft: RangeDraft = { dates: [null, null], fromTime: DEFAULT_FROM_TIME, toTime: DEFAULT_TO_TIME };

/** Local date and time of an ISO instant, in the browser's timezone. */
export function draftFromInstants(from: string | null, to: string | null): RangeDraft {
  const start = from === null ? null : dayjs(from);
  const end = to === null ? null : dayjs(to);
  return {
    dates: [start?.format("YYYY-MM-DD") ?? null, end?.format("YYYY-MM-DD") ?? null],
    fromTime: start?.format("HH:mm") ?? DEFAULT_FROM_TIME,
    toTime: end?.format("HH:mm") ?? DEFAULT_TO_TIME,
  };
}

/** The local wall-clock moment as a UTC ISO instant; null when the time text is incomplete. */
export function toInstant(date: string, time: string): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  const [y, m, d] = date.split("-").map(Number);
  if (match === null || y === undefined || m === undefined || d === undefined) return null;
  return new Date(y, m - 1, d, Number(match[1]), Number(match[2])).toISOString();
}

export function summarize(from: string | null, to: string | null): string | null {
  if (from === null && to === null) return null;
  const format = (iso: string | null) => (iso === null ? "…" : dayjs(iso).format("D MMM YYYY HH:mm"));
  return `${format(from)} – ${format(to)}`;
}
