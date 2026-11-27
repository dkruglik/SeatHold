import { Anchor, Stack, Tabs, Text, Title } from "@mantine/core";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { AdminLayout } from "./components/admin-header";
import { StartTime } from "./components/events-table";
import { ListSkeleton } from "./components/list-states";
import { ReleaseModal } from "./components/release-modal";
import { BoughtTicketsTab, OpenTicketsTab } from "./components/tickets-tabs";
import { useBoughtTickets, useOpenTickets } from "./hooks/use-admin-queries";
import type { OpenTicket } from "./types";

type TabName = "open" | "bought";

function BoughtPanel({ eventId, timezone }: { readonly eventId: string; readonly timezone: string }) {
  const [page, setPage] = useState(1);
  return <BoughtTicketsTab query={useBoughtTickets(eventId, page)} page={page} onPage={setPage} timezone={timezone} />;
}

/** One event: its open and its bought tickets, each tab fetched only once it is shown. */
export function AdminEventDetailPage() {
  const { eventId = "" } = useParams();
  const [tab, setTab] = useState<TabName>("open");
  const [openPage, setOpenPage] = useState(1);
  const [releasing, setReleasing] = useState<OpenTicket | null>(null);
  const open = useOpenTickets(eventId, openPage);
  const header = open.data?.event;
  const timezone = header?.timezone ?? "UTC";

  return (
    <AdminLayout>
      <Stack gap="lg">
        <Anchor component={Link} to="/admin">
          Back to events
        </Anchor>
        {header === undefined && !open.isError && <ListSkeleton label="Loading event" />}
        {header !== undefined && (
          <Stack gap={4}>
            <Title order={1}>{header.showTitle}</Title>
            {header.venueName !== undefined && <Text>{header.venueName}{header.city === undefined ? "" : `, ${header.city}`}</Text>}
            <StartTime startsAt={header.startsAt} timezone={header.timezone} />
          </Stack>
        )}
        <Tabs value={tab} onChange={(value) => setTab(value === "bought" ? "bought" : "open")} keepMounted={false}>
          <Tabs.List>
            <Tabs.Tab value="open">Open tickets</Tabs.Tab>
            <Tabs.Tab value="bought">Bought tickets</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="open" pt="md">
            <OpenTicketsTab query={open} page={openPage} onPage={setOpenPage} timezone={timezone} onRelease={setReleasing} />
          </Tabs.Panel>
          <Tabs.Panel value="bought" pt="md">
            <BoughtPanel eventId={eventId} timezone={timezone} />
          </Tabs.Panel>
        </Tabs>
      </Stack>
      {releasing !== null && <ReleaseModal key={releasing.seatId} eventId={eventId} seat={releasing} onClose={() => setReleasing(null)} />}
    </AdminLayout>
  );
}
