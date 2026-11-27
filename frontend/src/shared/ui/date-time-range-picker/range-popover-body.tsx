import { Button, Group, Stack, Text } from "@mantine/core";
import { DatePicker, TimeInput } from "@mantine/dates";
import { PRESETS, presetDraft, sameDraft } from "./range-presets";
import type { RangeDraft } from "./range-state";
import type { ChangedPart } from "./use-range-draft";

export { END_BEFORE_START_MESSAGE } from "./range-validation";

const ERROR_ID = "range-picker-error";

interface Props {
  readonly draft: RangeDraft;
  readonly error: string | null;
  readonly clearLabel: string;
  readonly minDate: Date | string | undefined;
  readonly zone: string;
  readonly now: () => Date;
  readonly apply: (next: RangeDraft, changed: ChangedPart) => void;
  readonly clear: () => void;
}

/**
 * Calendar, the two time fields, the presets and Clear, in that Tab order. Every change is applied
 * live. The message sits in one alert that both time fields point to.
 */
export function RangePopoverBody({ draft, error, clearLabel, minDate, zone, now, apply, clear }: Props) {
  const oneDayPicked = draft.dates[0] !== null && draft.dates[1] === null;
  const invalid = error === null ? {} : { error: true, "aria-describedby": ERROR_ID };
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
          {...invalid}
          onChange={(event) => apply({ ...draft, fromTime: event.currentTarget.value }, "fromTime")}
        />
        <TimeInput
          label="To time"
          value={draft.toTime}
          {...invalid}
          onChange={(event) => apply({ ...draft, toTime: event.currentTarget.value }, "toTime")}
        />
      </Group>
      <Text size="xs" c="dimmed">Times in {zone}</Text>
      {error !== null && <Text id={ERROR_ID} size="sm" c="red" role="alert">{error}</Text>}
      <Group gap="xs" role="group" aria-label="Quick ranges">
        {PRESETS.map(({ id, label }) => (
          <Button
            key={id}
            size="compact-sm"
            variant="default"
            aria-pressed={sameDraft(draft, presetDraft(id, now(), zone))}
            onClick={() => apply(presetDraft(id, now(), zone), "dates")}
          >
            {label}
          </Button>
        ))}
      </Group>
      <Button variant="subtle" onClick={clear}>{clearLabel}</Button>
    </Stack>
  );
}
