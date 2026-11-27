import { Anchor, Table, Text } from "../../../shared/ui";
import { Link } from "react-router";
import { formatPrice, formatStart } from "../../../shared/lib/format";
import type { AdminEventRow } from "../types";

export function StartTime({ startsAt, timezone }: { readonly startsAt: string; readonly timezone: string | undefined }) {
  const start = formatStart(startsAt, timezone ?? "UTC");
  return (
    <Text size="sm" component="span">
      {start.text} ({start.timezone})
    </Text>
  );
}

/** Scrolls sideways inside its own container on a narrow screen. */
export function EventsTable({ items, busy }: { readonly items: readonly AdminEventRow[]; readonly busy: boolean }) {
  return (
    <Table.ScrollContainer minWidth={760} aria-busy={busy}>
      <Table striped aria-label="Events" style={{ opacity: busy ? 0.6 : 1 }}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Show</Table.Th>
            <Table.Th>Venue</Table.Th>
            <Table.Th>Starts</Table.Th>
            <Table.Th>Price</Table.Th>
            <Table.Th ta="right">Seats</Table.Th>
            <Table.Th ta="right">Sold</Table.Th>
            <Table.Th ta="right">Held</Table.Th>
            <Table.Th ta="right">Available</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((event) => (
            <Table.Tr key={event.eventId}>
              <Table.Td>
                <Anchor component={Link} to={`/admin/events/${event.eventId}`}>
                  {event.showTitle}
                </Anchor>
              </Table.Td>
              <Table.Td>
                {event.venueName}, {event.city}
              </Table.Td>
              <Table.Td>
                <StartTime startsAt={event.startsAt} timezone={event.timezone} />
              </Table.Td>
              <Table.Td>{formatPrice(event.priceMinor, event.currency)}</Table.Td>
              <Table.Td ta="right">{event.seatCount}</Table.Td>
              <Table.Td ta="right">{event.sold}</Table.Td>
              <Table.Td ta="right">{event.held}</Table.Td>
              <Table.Td ta="right">{event.available}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
