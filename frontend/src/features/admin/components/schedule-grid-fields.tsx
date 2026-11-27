import { SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { formatStart } from "../../../shared/lib/format";
import { MAX_SEATS, totalSeats } from "../lib/event-form";
import { bind, type FormApi } from "./form-types";

interface Props {
  readonly form: FormApi;
  /** The venue's zone when known, so the operator sees the start on the venue's wall clock. */
  readonly zone: string | undefined;
}

export function ScheduleGridFields({ form, zone }: Props) {
  const total = totalSeats(form.values);
  const start = new Date(form.values.startsAt);
  const preview = zone !== undefined && !Number.isNaN(start.getTime()) ? formatStart(start.toISOString(), zone) : undefined;
  return (
    <Stack gap="sm">
      <TextInput
        type="datetime-local"
        label="Starts at"
        description="Your browser's local time"
        withAsterisk
        {...bind(form, "startsAt")}
      />
      {preview !== undefined && (
        <Text size="sm" c="dimmed">
          Venue time: {preview.text} ({preview.timezone})
        </Text>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput label="Price" description="In major units, for example 45.50" withAsterisk inputMode="decimal" {...bind(form, "price")} />
        <TextInput label="Currency" description="3 letters" withAsterisk maxLength={3} {...bind(form, "currency")} />
        <TextInput label="Rows" description="1 to 200" withAsterisk inputMode="numeric" {...bind(form, "rows")} />
        <TextInput label="Seats per row" description="1 to 200" withAsterisk inputMode="numeric" {...bind(form, "seatsPerRow")} />
      </SimpleGrid>
      <Text role="status" fw={600} {...(total > MAX_SEATS ? { c: "red" } : {})}>
        Seats: {total.toLocaleString("en")} (max {MAX_SEATS.toLocaleString("en")})
      </Text>
    </Stack>
  );
}
