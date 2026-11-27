import { Anchor, Badge, Card, Group, Stack, Text, Title } from "../../../shared/ui";
import { Link } from "react-router";
import { formatPrice, formatStart, seatsLabel } from "../../../shared/lib/format";
import type { ShowItem } from "../types";

/** One event of the result list. The link target is the event page. */
export function ShowRow({ item }: { readonly item: ShowItem }) {
  const start = formatStart(item.startsAt, item.venue.timezone);
  return (
    <Card component="li" style={{ listStyle: "none" }}>
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Stack gap={4} style={{ flex: "1 1 16rem", minWidth: 0 }}>
          <Title order={3} size="h4" style={{ overflowWrap: "anywhere" }}>
            <Anchor component={Link} to={`/events/${item.eventId}`} inherit>
              {item.title}
            </Anchor>
          </Title>
          <Group gap="xs">
            <Badge variant="light">{item.type}</Badge>
            <Badge variant="outline">{item.genre}</Badge>
          </Group>
          <Text size="sm">{`${item.venue.name}, ${item.venue.city}`}</Text>
          <Text size="sm" c="dimmed">
            <time dateTime={item.startsAt}>{start.text}</time>
            {` (${start.timezone})`}
          </Text>
        </Stack>
        <Stack gap={4} align="flex-end">
          <Text fw={700}>{formatPrice(item.priceMinor, item.currency)}</Text>
          {item.seatsLeft === 0 ? (
            <Badge color="red">Sold out</Badge>
          ) : (
            <Text size="sm" c="dimmed">{seatsLabel(item.seatsLeft)}</Text>
          )}
        </Stack>
      </Group>
    </Card>
  );
}
