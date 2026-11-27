import { Anchor, Button, Stack, Text } from "../../shared/ui";
import { useState } from "react";
import { Link } from "react-router";
import { AdminLayout } from "./components/admin-header";
import { EventsTable } from "./components/events-table";
import { ListError, ListSkeleton, Pager } from "./components/list-states";
import { useAdminEvents } from "./hooks/use-admin-queries";

/** The back office home: every event with its seat counts. */
export function AdminEventsPage() {
  const [page, setPage] = useState(1);
  const events = useAdminEvents(page);

  return (
    <AdminLayout
      title="Back office"
      actions={
        <Button component={Link} to="/admin/events/new">
          Create event
        </Button>
      }
    >
      <Stack gap="lg">
        {events.isError ? (
          <ListError title="Could not load events" onRetry={() => void events.refetch()} />
        ) : events.data === undefined ? (
          <ListSkeleton label="Loading events" />
        ) : events.data.items.length === 0 ? (
          <Text fw={600}>No events yet</Text>
        ) : (
          <>
            <EventsTable items={events.data.items} busy={events.isPlaceholderData} />
            <Pager page={page} totalPages={events.data.totalPages} onPage={setPage} />
          </>
        )}
        <Anchor component={Link} to="/">
          Back to home
        </Anchor>
      </Stack>
    </AdminLayout>
  );
}
