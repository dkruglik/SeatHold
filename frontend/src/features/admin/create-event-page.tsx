import { Anchor, Stack } from "../../shared/ui";
import { Link } from "react-router";
import { AdminLayout } from "./components/admin-header";
import { CreateEventForm } from "./components/create-event-form";
import { ListError, ListSkeleton } from "./components/list-states";
import { useLookups } from "./hooks/use-admin-queries";

export function CreateEventPage() {
  const lookups = useLookups();

  return (
    <AdminLayout title="Create event">
      <Stack gap="lg" maw={640}>
        <Anchor component={Link} to="/admin">
          Back to events
        </Anchor>
        {lookups.isError ? (
          <ListError title="Could not load shows and venues" onRetry={() => void lookups.refetch()} />
        ) : lookups.data === undefined ? (
          <ListSkeleton label="Loading shows and venues" />
        ) : (
          <CreateEventForm lookups={lookups.data} />
        )}
      </Stack>
    </AdminLayout>
  );
}
