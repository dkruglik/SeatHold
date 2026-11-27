import { Anchor, Button, Group, Stack, Text, Title } from "@mantine/core";
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { formatPrice } from "../../../shared/lib/format";
import type { ConfirmedBooking, OrderSeat } from "../types";

interface ConfirmationProps {
  readonly booking: ConfirmedBooking;
  readonly seats: readonly OrderSeat[];
  /** The guest's email, or `null` for a signed-in buyer. */
  readonly guestEmail: string | null;
  readonly onClose: () => void;
}

/** Signed-in buyers see their ticket codes here and in My bookings; guests get a link by email, and the QR comes with it. */
export function Confirmation({ booking, seats, guestEmail, onClose }: ConfirmationProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const labelOf = (seatId: string) => seats.find((s) => s.id === seatId)?.label ?? "Seat";
  return (
    <Stack gap="sm">
      <Title order={2} size="h4" tabIndex={-1} ref={heading}>Booking confirmed</Title>
      <Text>Reference <strong>{booking.id}</strong></Text>
      {guestEmail === null ? (
        <ul style={{ margin: 0, paddingInlineStart: "1.2rem" }}>
          {booking.tickets.map((t) => <li key={t.seatId}>{`${labelOf(t.seatId)}: ${t.code}`}</li>)}
        </ul>
      ) : (
        <Text>{`Check your email: we sent a link to ${guestEmail} to view your ticket and QR code.`}</Text>
      )}
      <Group justify="space-between">
        <Text fw={700}>Total</Text>
        <Text fw={700}>{formatPrice(booking.totalMinor, booking.currency)}</Text>
      </Group>
      {guestEmail === null ? <Anchor component={Link} to="/bookings">My bookings</Anchor> : null}
      <Button variant="default" onClick={onClose}>Book more seats</Button>
    </Stack>
  );
}
