import { useEffect, useState } from "react";
import type { DateTimeRange } from "./date-time-range-picker";
import { draftFromInstants, emptyDraft, toInstant, type RangeDraft } from "./range-state";
import { END_BEFORE_START_MESSAGE, validateRange } from "./range-validation";

export type ChangedPart = "dates" | "fromTime" | "toTime";

export function emitFor(draft: RangeDraft, zone?: string): DateTimeRange {
  const [startDay, endDay] = draft.dates;
  return {
    from: startDay === null ? null : toInstant(startDay, draft.fromTime, zone),
    to: endDay === null ? null : toInstant(endDay, draft.toTime, zone),
  };
}

/** Same-day end before start: keep the field being edited and pull the other end onto it. */
function clampSameDay(next: RangeDraft, changed: ChangedPart): { draft: RangeDraft; clamped: boolean } {
  const [startDay, endDay] = next.dates;
  if (startDay !== endDay || next.toTime >= next.fromTime) return { draft: next, clamped: false };
  const time = changed === "fromTime" ? { fromTime: next.toTime } : { toTime: next.fromTime };
  return { draft: { ...next, ...time }, clamped: true };
}

export interface RangeDraftOptions {
  readonly zone: string;
  readonly now: () => Date;
  readonly allowPast: boolean;
}

/**
 * Editing state of the picker; `apply` emits only complete, valid ranges. `error` is the message to
 * show: a same-day end before the start is clamped (and emitted clamped); a range that is already
 * over, or an inverted value from the owner, is shown but never emitted.
 */
export function useRangeDraft(value: DateTimeRange, onChange: (value: DateTimeRange) => void, options: RangeDraftOptions) {
  const { zone, now, allowPast } = options;
  const [draft, setDraft] = useState<RangeDraft>(() => draftFromInstants(value.from, value.to, zone));
  const [clamped, setClamped] = useState(false);

  // Follow the owner when it changes the value from outside (URL navigation, reset).
  useEffect(() => {
    setDraft((current) => {
      const emitted = emitFor(current, zone);
      return emitted.from === value.from && emitted.to === value.to ? current : draftFromInstants(value.from, value.to, zone);
    });
  }, [value.from, value.to, zone]);

  function apply(next: RangeDraft, changed: ChangedPart) {
    const incomplete = next.dates[0] === null || next.dates[1] === null || next.fromTime === "" || next.toTime === "";
    if (incomplete) {
      // A missing day, or a time field being retyped: nothing to emit yet.
      setDraft(next);
      return;
    }
    const result = clampSameDay(next, changed);
    setClamped(result.clamped);
    setDraft(result.draft);
    const emitted = emitFor(result.draft, zone);
    if (validateRange(emitted, now(), allowPast) === null) onChange(emitted);
  }

  function clear() {
    setClamped(false);
    setDraft(emptyDraft);
    onChange({ from: null, to: null });
  }

  const error = clamped ? END_BEFORE_START_MESSAGE : validateRange(emitFor(draft, zone), now(), allowPast);
  return { draft, error, apply, clear };
}
