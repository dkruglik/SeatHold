import { Alert, Anchor, Container, Group, Stack } from "@mantine/core";
import { Link, useParams } from "react-router";
import { ApiError } from "../../shared/lib/api-client";
import { SeatMap } from "../../shared/ui/seat-map";
import { EventHeader } from "./components/event-header";
import { EventLoadError, EventLoading, EventNotFound } from "./components/event-states";
import { SelectionPanel } from "./components/selection-panel";
import { useEventDetail, useSeatMap } from "./hooks/event-queries";
import { useHoldSession } from "./hooks/use-hold-session";
import { useSeatToggle } from "./hooks/use-seat-toggle";
import { toMapSeats } from "./lib/seats";
import type { EventDetail, HoldSummary } from "./types";

export interface EventPageProps {
  /** The seam for the next step: called with the live hold when the buyer continues to payment. */
  readonly onContinue?: (hold: HoldSummary) => void;
}

/** One event: its details, a live seat map, and the buyer's selection with the hold countdown. */
export function EventPage({ onContinue }: EventPageProps) {
  const { eventId = "" } = useParams();
  const event = useEventDetail(eventId);
  const notFound = event.error instanceof ApiError && event.error.status === 404;
  return (
    <main>
      <Container size="lg" py="xl">
        <Stack gap="lg">
          <Anchor component={Link} to="/">All shows</Anchor>
          {event.isPending ? <EventLoading /> : null}
          {notFound ? <EventNotFound /> : null}
          {event.isError && !notFound ? <EventLoadError message="Could not load this event." onRetry={() => void event.refetch()} /> : null}
          {event.data !== undefined ? <EventScreen event={event.data} onContinue={onContinue} /> : null}
        </Stack>
      </Container>
    </main>
  );
}

function EventScreen({ event, onContinue }: { readonly event: EventDetail; readonly onContinue: EventPageProps["onContinue"] }) {
  const seatMap = useSeatMap(event.eventId);
  const session = useHoldSession(event.eventId);
  const seatToggle = useSeatToggle(event.eventId);
  const seats = seatMap.data === undefined ? [] : toMapSeats(seatMap.data, session.seatIds);
  const seatsLeft = seatMap.data === undefined ? event.seatsLeft : seats.filter((s) => s.state === "available").length;

  return (
    <>
      <EventHeader event={event} seatsLeft={seatsLeft} />
      {seatToggle.message !== null ? <Alert role="alert" color="red">{seatToggle.message}</Alert> : null}
      <Group align="flex-start" wrap="wrap" gap="xl">
        <div style={{ flex: "1 1 24rem", minWidth: 0 }}>
          {seatMap.data !== undefined ? (
            <SeatMap rows={event.rows} seatsPerRow={event.seatsPerRow} seats={seats} onSelect={seatToggle.toggle} disabled={seatToggle.pending} />
          ) : seatMap.isError ? (
            <EventLoadError message="Could not load the seat map." onRetry={() => void seatMap.refetch()} />
          ) : (
            <EventLoading />
          )}
        </div>
        <div style={{ flex: "0 1 20rem", minWidth: "16rem" }}>
          <SelectionPanel event={event} mySeats={seats.filter((s) => s.state === "held_by_me")} session={session} onContinue={onContinue} />
        </div>
      </Group>
    </>
  );
}
