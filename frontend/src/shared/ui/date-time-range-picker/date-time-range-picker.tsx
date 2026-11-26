import { InputBase, Popover, Text } from "@mantine/core";
import { useState } from "react";
import { RangePopoverBody } from "./range-popover-body";
import { summarize } from "./range-state";
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
}

/**
 * One control for a from-to range of date and time. The value holds UTC ISO instants; the UI edits
 * them in the browser's local time. Changes apply live (no Apply button) so the owner can keep the
 * value in the URL. A day range starts at 00:00 and ends at 23:59 unless the time fields say otherwise.
 * It never emits an inverted range: an end at or before the start is clamped to the start.
 */
export function DateTimeRangePicker({ value, onChange, label = "Date and time range", clearLabel = "Clear", error, minDate }: DateTimeRangePickerProps) {
  const [opened, setOpened] = useState(false);
  const { draft, clamped, apply, clear } = useRangeDraft(value, onChange);
  const summary = summarize(value.from, value.to);

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
        <RangePopoverBody draft={draft} clamped={clamped} clearLabel={clearLabel} minDate={minDate} apply={apply} clear={clear} />
      </Popover.Dropdown>
    </Popover>
  );
}
