import type { ReactNode } from "react";
import { Button, Stack, Table, Text } from "@mantine/core";
import type { UseQueryResult } from "@tanstack/react-query";
import { formatStart } from "../../../shared/lib/format";
import type { BoughtTicket, OpenTicket, TicketPage } from "../types";
import { ListError, ListSkeleton, Pager } from "./list-states";

export function Time({ iso, timezone }: { readonly iso: string; readonly timezone: string }) {
  const start = formatStart(iso, timezone);
  return <>{`${start.text} (${start.timezone})`}</>;
}

interface TabProps<T> {
  readonly query: UseQueryResult<TicketPage<T>>;
  readonly page: number;
  readonly onPage: (page: number) => void;
  readonly timezone: string;
}

/** Loading, error, empty or the table with its pager; the rows are rendered by `children`. */
function TicketList<T>({ query, page, onPage, label, empty, summary, head, children }: Omit<TabProps<T>, "timezone"> & {
  readonly label: string;
  readonly empty: string;
  readonly summary: (total: number) => string;
  readonly head: readonly string[];
  readonly children: (items: readonly T[]) => ReactNode;
}) {
  if (query.isError) {
    return <ListError title="Could not load the tickets" onRetry={() => void query.refetch()} />;
  }
  if (query.data === undefined) {
    return <ListSkeleton label={`Loading ${label.toLowerCase()}`} />;
  }
  if (query.data.items.length === 0) {
    return <Text fw={600}>{empty}</Text>;
  }
  return (
    <Stack gap="md" aria-busy={query.isPlaceholderData}>
      <Text size="sm">{summary(query.data.total)}</Text>
      <Table.ScrollContainer minWidth={520}>
        <Table striped aria-label={label} style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}>
          <Table.Thead>
            <Table.Tr>
              {head.map((name) => (
                <Table.Th key={name}>{name}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{children(query.data.items)}</Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Pager page={page} totalPages={query.data.totalPages} onPage={onPage} />
    </Stack>
  );
}

export function OpenTicketsTab({ query, page, onPage, timezone, onRelease }: TabProps<OpenTicket> & { readonly onRelease: (seat: OpenTicket) => void }) {
  return (
    <TicketList query={query} page={page} onPage={onPage} label="Open tickets" empty="No open tickets" summary={(n) => `${n} open ${n === 1 ? "seat" : "seats"}`} head={["Row", "Seat", "State", "Held until", ""]}>
      {(items) =>
        items.map((seat) => (
          <Table.Tr key={seat.seatId}>
            <Table.Td>{seat.row}</Table.Td>
            <Table.Td>{seat.number}</Table.Td>
            <Table.Td>{seat.state}</Table.Td>
            <Table.Td>{seat.heldUntil === null ? "" : <Time iso={seat.heldUntil} timezone={timezone} />}</Table.Td>
            <Table.Td>
              {seat.state === "held" && (
                <Button variant="default" size="compact-sm" onClick={() => onRelease(seat)} aria-label={`Release seat ${seat.row}${seat.number}`}>
                  Release
                </Button>
              )}
            </Table.Td>
          </Table.Tr>
        ))
      }
    </TicketList>
  );
}

export function BoughtTicketsTab({ query, page, onPage, timezone }: TabProps<BoughtTicket>) {
  return (
    <TicketList query={query} page={page} onPage={onPage} label="Bought tickets" empty="No tickets sold yet" summary={(n) => `${n} ${n === 1 ? "ticket" : "tickets"} sold`} head={["Row", "Seat", "Buyer", "Buyer type", "Booked at"]}>
      {(items) =>
        items.map((ticket) => (
          <Table.Tr key={ticket.ticketId}>
            <Table.Td>{ticket.row}</Table.Td>
            <Table.Td>{ticket.number}</Table.Td>
            <Table.Td style={{ overflowWrap: "anywhere" }}>{ticket.buyerEmail}</Table.Td>
            <Table.Td>{ticket.buyerType}</Table.Td>
            <Table.Td>
              <Time iso={ticket.bookedAt} timezone={timezone} />
            </Table.Td>
          </Table.Tr>
        ))
      }
    </TicketList>
  );
}

