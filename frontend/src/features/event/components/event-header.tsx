import { Badge, Group, Stack, Text, Title } from "../../../shared/ui";
import { formatPrice, formatStart, seatsLabel } from "../../../shared/lib/format";
import type { EventDetail } from "../types";

export function EventHeader({ event, seatsLeft }: { readonly event: EventDetail; readonly seatsLeft: number }) {
  const start = formatStart(event.startsAt, event.venue.timezone);
  return (
    <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
      <Stack gap={4}>
        <Title order={1}>{event.title}</Title>
        <Text>{`${event.venue.name}, ${event.venue.city}`}</Text>
        <Text c="dimmed">
          <time dateTime={event.startsAt}>{start.text}</time>
          {` (${start.timezone})`}
        </Text>
      </Stack>
      <Stack gap={4} align="flex-end">
        <Group gap={6} align="baseline">
          <Text fw={700} size="lg">{formatPrice(event.priceMinor, event.currency)}</Text>
          <Text size="sm" c="dimmed">per seat</Text>
        </Group>
        {seatsLeft === 0 ? <Badge color="red">Sold out</Badge> : <Text size="sm" c="dimmed">{seatsLabel(seatsLeft)}</Text>}
      </Stack>
    </Group>
  );
}
