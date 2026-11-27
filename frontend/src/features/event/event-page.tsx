import { Alert, Anchor, Group, PageLayout, SeatMap, Stack, useNarrow } from "../../shared/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError } from "../../shared/lib/api-client";
import { CheckoutPanel, type OrderSummary } from "../checkout";
import { CheckoutBar } from "./components/checkout-bar";
import { EventHeader } from "./components/event-header";
import { EventLoadError, EventLoading, EventNotFound } from "./components/event-states";
import { SelectionPanel } from "./components/selection-panel";
import { eventKeys, useEventDetail, useSeatMap } from "./hooks/event-queries";
import { useHoldSession } from "./hooks/use-hold-session";
import { useSeatToggle } from "./hooks/use-seat-toggle";
import { seatLabel, toMapSeats } from "./lib/seats";
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
      <PageLayout title={event.data?.title ?? (notFound ? "Event not found" : "Event")}>
        <Anchor component={Link} to="/">All shows</Anchor>
        {event.isPending ? <EventLoading /> : null}
        {notFound ? <EventNotFound /> : null}
        {event.isError && !notFound ? <EventLoadError message="Could not load this event." onRetry={() => void event.refetch()} /> : null}
        {event.data !== undefined ? <EventScreen event={event.data} onContinue={onContinue} /> : null}
      </PageLayout>
    </main>
  );
}

function EventScreen({ event, onContinue }: { readonly event: EventDetail; readonly onContinue: EventPageProps["onContinue"] }) {
  const seatMap = useSeatMap(event.eventId);
  const session = useHoldSession(event.eventId);
  const seatToggle = useSeatToggle(event.eventId);
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const narrow = useNarrow();
  const checkout = useRef<HTMLDivElement>(null);
  const seats = seatMap.data === undefined ? [] : toMapSeats(seatMap.data, session.seatIds);
  const mySeats = seats.filter((s) => s.state === "held_by_me");
  const startCheckout = (hold: HoldSummary) => {
    setOrder({ eventId: event.eventId, eventTitle: event.title, priceMinor: event.priceMinor, currency: event.currency, seats: mySeats.map((s) => ({ id: s.id, label: seatLabel(s) })) });
    onContinue?.(hold);
  };
  const refetchSeats = () => {
    void queryClient.invalidateQueries({ queryKey: eventKeys.hold(event.eventId) });
    void queryClient.invalidateQueries({ queryKey: eventKeys.seats(event.eventId) });
  };
  const seatsLeft = seatMap.data === undefined ? event.seatsLeft : seats.filter((s) => s.state === "available").length;

  const docked = narrow && session.summary !== null;
  const fromBar = () => (order === null && session.summary !== null ? startCheckout(session.summary) : checkout.current?.scrollIntoView?.({ block: "start" }));

  return (
    <Stack gap="lg">
      <EventHeader event={event} seatsLeft={seatsLeft} />
      {seatToggle.message !== null ? <Alert role="alert" color="red">{seatToggle.message}</Alert> : null}
      <Group align="flex-start" wrap="wrap" gap="xl">
        <div style={{ flex: narrow ? "1 1 100%" : "1 1 24rem", minWidth: 0 }}>
          {seatMap.data !== undefined ? (
            <SeatMap rows={event.rows} seatsPerRow={event.seatsPerRow} seats={seats} onSelect={seatToggle.toggle} priceMinor={event.priceMinor} currency={event.currency} disabled={seatToggle.pending || order !== null} />
          ) : seatMap.isError ? (
            <EventLoadError message="Could not load the seat map." onRetry={() => void seatMap.refetch()} />
          ) : (
            <EventLoading />
          )}
        </div>
        <div style={{ flex: narrow ? "1 1 100%" : "0 1 20rem", minWidth: narrow ? 0 : "16rem" }}>
          <Stack gap="md">
            <SelectionPanel event={event} mySeats={mySeats} session={session} onContinue={startCheckout} checkingOut={order !== null} docked={docked} />
            {order !== null ? <div ref={checkout}><CheckoutPanel order={order} holdLive={session.summary !== null} onSettled={refetchSeats} onClose={() => setOrder(null)} /></div> : null}
          </Stack>
        </div>
      </Group>
      {docked ? <CheckoutBar remainingSeconds={session.remainingSeconds} checkingOut={order !== null} onContinue={fromBar} /> : null}
    </Stack>
  );
}
