import { Alert, Button, Stack } from "@mantine/core";
import { useRef } from "react";
import { useCreateEventForm } from "../hooks/use-create-event-form";
import { venueZone } from "../lib/event-form";
import type { Lookups } from "../types";
import { ScheduleGridFields } from "./schedule-grid-fields";
import { ShowFields, VenueFields } from "./show-venue-fields";

export function CreateEventForm({ lookups }: { readonly lookups: Lookups }) {
  const formRef = useRef<HTMLFormElement>(null);
  const form = useCreateEventForm(formRef);

  return (
    <form ref={formRef} onSubmit={form.submit} noValidate aria-label="Create event">
      <Stack gap="xl">
        <ShowFields form={form} lookups={lookups} />
        <VenueFields form={form} lookups={lookups} />
        <ScheduleGridFields form={form} zone={venueZone(form.values, lookups)} />
        {form.failure !== undefined && (
          <Alert color="red" role="alert" title="Event not created">
            {form.failure}
          </Alert>
        )}
        <Button type="submit" loading={form.pending} disabled={form.pending} style={{ alignSelf: "flex-start" }}>
          Create event
        </Button>
      </Stack>
    </form>
  );
}

