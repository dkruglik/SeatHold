import { InputBase, Popover, Text } from "@mantine/core";
import { useState } from "react";
import { RangePopoverBody } from "./range-popover-body";
import { browserTimeZone, summarize } from "./range-state";
import { useRangeDraft } from "./use-range-draft";

export interface DateTimeRange {
  /** ISO instant (UTC), or null. */
  readonly from: string | null;
  readonly to: string | null;
}

export interface DateTimeRangePickerProps {
  readonly value: DateTimeRange;
  readonly onChange: (value: DateTimeRange) => void;
  readonly label?: string;
  readonly clearLabel?: string;
  readonly error?: string;
  readonly minDate?: Date | string;
  /** IANA zone the dates and times are read and written in; the browser's zone by default. */
  readonly timeZone?: string;
  /** Accept a range that is already over. Off by default: such a range is explained, not applied. */
  readonly allowPast?: boolean;
  /** The current moment; replaced in tests. */
  readonly now?: () => Date;
}

const systemNow = () => new Date();

/**
 * One control for a from-to range of date and time. The value holds UTC ISO instants; the UI reads
 * and writes them in `timeZone` (the browser's zone by default). A picked calendar day is a wall date
 * in that zone, so day and time fields always agree. Changes apply live (no Apply button) so the
 * owner can keep the value in the URL. A day range starts at 00:00 and ends at 23:59 unless the time
 * fields say otherwise. A same-day end at or before the start is clamped to the start. An inverted
 * value from the owner is shown with a message, not emitted. A range that is already over is
 * rejected (message, no emit) unless `allowPast`.
 */
export function DateTimeRangePicker({ value, onChange, label = "Date and time range", clearLabel = "Clear", error, minDate, timeZone, allowPast = false, now = systemNow }: DateTimeRangePickerProps) {
  const zone = timeZone ?? browserTimeZone();
  const [opened, setOpened] = useState(false);
  const { draft, error: rangeError, apply, clear } = useRangeDraft(value, onChange, { zone, now, allowPast });
  const summary = summarize(value.from, value.to, zone);

  return (
    <Popover opened={opened} onChange={setOpened} trapFocus returnFocus closeOnEscape position="bottom-start" shadow="md">
      <Popover.Target>
        <InputBase
          component="button"
          type="button"
          pointer
          label={label}
          aria-label={summary === null ? label : `${label}: ${summary}`}
          aria-haspopup="dialog"
          aria-expanded={opened}
          error={error}
          onClick={() => setOpened((o) => !o)}
        >
          {summary ?? <Text span c="dimmed">Any date and time</Text>}
        </InputBase>
      </Popover.Target>
      <Popover.Dropdown aria-label={label}>
        <RangePopoverBody draft={draft} error={rangeError} clearLabel={clearLabel} minDate={minDate} zone={zone} now={now} apply={apply} clear={clear} />
      </Popover.Dropdown>
    </Popover>
  );
}
