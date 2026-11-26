import { Button, Group, Stack, Text } from "@mantine/core";
import { DatePicker, TimeInput } from "@mantine/dates";
import type { RangeDraft } from "./range-state";
import type { ChangedPart } from "./use-range-draft";

export const END_BEFORE_START_MESSAGE = "End must be after start";

interface Props {
  readonly draft: RangeDraft;
  readonly clamped: boolean;
  readonly clearLabel: string;
  readonly minDate: Date | string | undefined;
  readonly apply: (next: RangeDraft, changed: ChangedPart) => void;
  readonly clear: () => void;
}

/** Calendar, the two time fields and Clear. Every change is applied live. */
export function RangePopoverBody({ draft, clamped, clearLabel, minDate, apply, clear }: Props) {
  const oneDayPicked = draft.dates[0] !== null && draft.dates[1] === null;
  return (
    <Stack gap="sm">
      <DatePicker
        type="range"
        allowSingleDateInRange
        {...(minDate === undefined ? {} : { minDate })}
        {...(draft.dates[0] === null ? {} : { defaultDate: draft.dates[0] })}
        value={[draft.dates[0], draft.dates[1]]}
        onChange={(dates) => apply({ ...draft, dates }, "dates")}
      />
      {oneDayPicked && <Text size="xs" c="dimmed">Pick the last day, or the same day again.</Text>}
      <Group grow align="flex-start">
        <TimeInput
          label="From time"
          value={draft.fromTime}
          onChange={(event) => apply({ ...draft, fromTime: event.currentTarget.value }, "fromTime")}
        />
        <TimeInput
          label="To time"
          value={draft.toTime}
          error={clamped}
          onChange={(event) => apply({ ...draft, toTime: event.currentTarget.value }, "toTime")}
        />
      </Group>
      {clamped && <Text size="sm" c="red" role="alert">{END_BEFORE_START_MESSAGE}</Text>}
      <Button variant="subtle" onClick={clear}>{clearLabel}</Button>
    </Stack>
  );
}
