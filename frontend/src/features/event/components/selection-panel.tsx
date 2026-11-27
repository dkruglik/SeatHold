import { Alert, Button, Group, Paper, type SeatMapSeat, Stack, Text, Title, VisuallyHidden } from "../../../shared/ui";
import { formatPrice } from "../../../shared/lib/format";
import { formatRemaining } from "../hooks/use-countdown";
import type { HoldSession } from "../hooks/use-hold-session";
import { seatLabel } from "../lib/seats";
import type { EventDetail, HoldSummary } from "../types";

interface SelectionPanelProps {
  readonly event: EventDetail;
  readonly mySeats: readonly SeatMapSeat[];
  readonly session: HoldSession;
  readonly onContinue: ((hold: HoldSummary) => void) | undefined;
  /** True while the checkout panel is open: the buyer is already continuing. */
  readonly checkingOut?: boolean;
}

const oneMinute = 60;

/** The politely announced part of the countdown: silent per tick, a message once at one minute. Expiry has its own status alert. */
function announcement(remaining: number | null): string {
  return remaining !== null && remaining > 0 && remaining <= oneMinute ? "One minute left on your hold." : "";
}

export function SelectionPanel({ event, mySeats, session, onContinue, checkingOut = false }: SelectionPanelProps) {
  const { summary, remainingSeconds, expired } = session;
  return (
    <Paper component="section" aria-label="Your selection" withBorder p="md">
      <Stack gap="sm">
        <Title order={2} size="h4">Your selection</Title>
        {mySeats.length === 0 ? (
          <Text c="dimmed">No seats selected.</Text>
        ) : (
          <>
            <ul style={{ margin: 0, paddingInlineStart: "1.2rem" }}>
              {mySeats.map((seat) => <li key={seat.id}>{seatLabel(seat)}</li>)}
            </ul>
            <Group justify="space-between">
              <Text fw={700}>Total</Text>
              <Text fw={700}>{formatPrice(mySeats.length * event.priceMinor, event.currency)}</Text>
            </Group>
          </>
        )}
        {remainingSeconds !== null ? (
          <Text role="timer" aria-live="off">{`Time left to pay: ${formatRemaining(remainingSeconds)}`}</Text>
        ) : null}
        {expired ? <Alert role="status" color="orange" title="Your hold expired">The seats were released. Pick them again to continue.</Alert> : null}
        <VisuallyHidden role="status" aria-live="polite" data-testid="hold-announcer">{announcement(remainingSeconds)}</VisuallyHidden>
        {session.failed ? <Text c="red" size="sm">Could not load your selection.</Text> : null}
        <Button disabled={summary === null || checkingOut} onClick={() => summary !== null && onContinue?.(summary)}>
          Continue to payment
        </Button>
      </Stack>
    </Paper>
  );
}
