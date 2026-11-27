import type { DateTimeRange } from "./date-time-range-picker";

export const END_BEFORE_START_MESSAGE = "End must be after start";
export const RANGE_PAST_MESSAGE = "This range is already over";

/** The message for an invalid complete range, or null. A range with an open end is not checked. */
export function validateRange(range: DateTimeRange, now: Date, allowPast: boolean): string | null {
  const { from, to } = range;
  if (from !== null && to !== null && Date.parse(to) < Date.parse(from)) return END_BEFORE_START_MESSAGE;
  if (!allowPast && to !== null && Date.parse(to) < now.getTime()) return RANGE_PAST_MESSAGE;
  return null;
}
