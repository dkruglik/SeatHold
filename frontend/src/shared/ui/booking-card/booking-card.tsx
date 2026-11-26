import { Badge, Group, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { formatPrice, formatStart } from "../../lib/format";
import { TicketQr } from "../ticket-qr";
import type { Booking } from "./types";

/** A booking with its event, total and one QR per ticket. Used by My bookings and by the guest access page. */
export function BookingCard({ booking }: { readonly booking: Booking }) {
  const { event } = booking;
  const start = formatStart(event.startsAt, event.timezone);

  return (
    <Paper component="article" withBorder p="md" radius="md" aria-labelledby={`booking-${booking.bookingId}`}>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
          <Stack gap={2}>
            <Title order={2} size="h3" id={`booking-${booking.bookingId}`}>
              {event.title}
            </Title>
            <Text size="sm">
              {event.venueName}, {event.city}
            </Text>
            <Text size="sm">
              {start.text} ({start.timezone})
            </Text>
          </Stack>
          <Stack gap={2} align="flex-end">
            <Badge variant="light">{booking.status}</Badge>
            <Text size="sm" fw={600}>
              Total {formatPrice(booking.totalMinor, booking.currency)}
            </Text>
          </Stack>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" component="ul" p={0} m={0} style={{ listStyle: "none" }}>
          {booking.tickets.map((ticket) => (
            <Paper key={ticket.ticketId} component="li" withBorder p="sm" radius="sm">
              <Stack gap="xs" align="center">
                <Text fw={600}>{`Row ${ticket.rowLabel}, seat ${ticket.seatNumber}`}</Text>
                <TicketQr code={ticket.code} />
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}
