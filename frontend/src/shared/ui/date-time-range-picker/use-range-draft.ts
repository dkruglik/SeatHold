import { useEffect, useState } from "react";
import type { DateTimeRange } from "./date-time-range-picker";
import { draftFromInstants, emptyDraft, toInstant, type RangeDraft } from "./range-state";

export type ChangedPart = "dates" | "fromTime" | "toTime";

export function emitFor(draft: RangeDraft): DateTimeRange {
  const [startDay, endDay] = draft.dates;
  return {
    from: startDay === null ? null : toInstant(startDay, draft.fromTime),
    to: endDay === null ? null : toInstant(endDay, draft.toTime),
  };
}

/** Same-day end before start: keep the field being edited and pull the other end onto it. */
function clampSameDay(next: RangeDraft, changed: ChangedPart): { draft: RangeDraft; clamped: boolean } {
  const [startDay, endDay] = next.dates;
  if (startDay !== endDay || next.toTime >= next.fromTime) return { draft: next, clamped: false };
  const time = changed === "fromTime" ? { fromTime: next.toTime } : { toTime: next.fromTime };
  return { draft: { ...next, ...time }, clamped: true };
}

/** Editing state of the picker; `apply` emits only complete, non-inverted ranges. */
export function useRangeDraft(value: DateTimeRange, onChange: (value: DateTimeRange) => void) {
  const [draft, setDraft] = useState<RangeDraft>(() => draftFromInstants(value.from, value.to));
  const [clamped, setClamped] = useState(false);

  // Follow the owner when it changes the value from outside (URL navigation, reset).
  useEffect(() => {
    setDraft((current) => {
      const emitted = emitFor(current);
      return emitted.from === value.from && emitted.to === value.to ? current : draftFromInstants(value.from, value.to);
    });
  }, [value.from, value.to]);

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
    onChange(emitFor(result.draft));
  }

  function clear() {
    setClamped(false);
    setDraft(emptyDraft);
    onChange({ from: null, to: null });
  }

  return { draft, clamped, apply, clear };
}
