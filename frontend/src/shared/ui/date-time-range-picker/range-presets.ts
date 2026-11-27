import dayjs from "dayjs";
import { DEFAULT_FROM_TIME, DEFAULT_TO_TIME, type RangeDraft } from "./range-state";

export type PresetId = "tonight" | "weekend" | "next7" | "next30";

export const PRESETS: readonly { readonly id: PresetId; readonly label: string }[] = [
  { id: "tonight", label: "Tonight" },
  { id: "weekend", label: "This weekend" },
  { id: "next7", label: "Next 7 days" },
  { id: "next30", label: "Next 30 days" },
];

const DAY = "YYYY-MM-DD";
const addDays = (date: string, days: number) => dayjs(date).add(days, "day").format(DAY);

/**
 * The draft (wall-clock in `zone`) a preset stands for. Like the calendar, a range that ends on a day
 * ends at 23:59 of that day; "now" is cut to the minute.
 */
export function presetDraft(id: PresetId, now: Date, zone: string): RangeDraft {
  const here = dayjs(now).tz(zone);
  const today = here.format(DAY);
  const nowTime = here.format("HH:mm");
  const fromNow = (endDate: string, toTime: string): RangeDraft => ({ dates: [today, endDate], fromTime: nowTime, toTime });
  switch (id) {
    case "tonight":
      return fromNow(today, DEFAULT_TO_TIME);
    case "next7":
      return fromNow(addDays(today, 7), nowTime);
    case "next30":
      return fromNow(addDays(today, 30), nowTime);
    case "weekend": {
      const weekday = here.day(); // 0 Sunday, 6 Saturday
      if (weekday === 6) return fromNow(addDays(today, 1), DEFAULT_TO_TIME);
      if (weekday === 0) return fromNow(today, DEFAULT_TO_TIME);
      const saturday = addDays(today, 6 - weekday);
      return { dates: [saturday, addDays(saturday, 1)], fromTime: DEFAULT_FROM_TIME, toTime: DEFAULT_TO_TIME };
    }
  }
}

export function sameDraft(a: RangeDraft, b: RangeDraft): boolean {
  return a.dates[0] === b.dates[0] && a.dates[1] === b.dates[1] && a.fromTime === b.fromTime && a.toTime === b.toTime;
}
