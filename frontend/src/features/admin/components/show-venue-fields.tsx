import { NativeSelect, Stack, Textarea, TextInput } from "@mantine/core";
import { NEW } from "../lib/event-form";
import { commonTimezones } from "../lib/timezones";
import type { Lookups } from "../types";
import { bind, type FormApi } from "./form-types";

const timezoneListId = "common-timezones";

export function ShowFields({ form, lookups }: { readonly form: FormApi; readonly lookups: Lookups }) {
  const options = [
    { value: "", label: "Choose a show" },
    ...lookups.shows.map((show) => ({ value: show.id, label: `${show.title} (${show.type}, ${show.genre})` })),
    { value: NEW, label: "New show" },
  ];
  return (
    <Stack gap="sm">
      <NativeSelect label="Show" withAsterisk data={options} {...bind(form, "show")} />
      {form.values.show === NEW && (
        <>
          <TextInput label="Title" withAsterisk maxLength={100} {...bind(form, "showTitle")} />
          <TextInput label="Type" withAsterisk maxLength={100} {...bind(form, "showType")} />
          <TextInput label="Genre" withAsterisk maxLength={100} {...bind(form, "showGenre")} />
          <Textarea label="Description" maxLength={2000} rows={3} {...bind(form, "showDescription")} />
        </>
      )}
    </Stack>
  );
}

export function VenueFields({ form, lookups }: { readonly form: FormApi; readonly lookups: Lookups }) {
  const options = [
    { value: "", label: "Choose a venue" },
    ...lookups.venues.map((venue) => ({ value: venue.id, label: `${venue.name}, ${venue.city} (${venue.timezone})` })),
    { value: NEW, label: "New venue" },
  ];
  return (
    <Stack gap="sm">
      <NativeSelect label="Venue" withAsterisk data={options} {...bind(form, "venue")} />
      {form.values.venue === NEW && (
        <>
          <TextInput label="Venue name" withAsterisk maxLength={100} {...bind(form, "venueName")} />
          <TextInput label="City" withAsterisk maxLength={100} {...bind(form, "venueCity")} />
          <TextInput label="Country code" description="2 letters, for example DE" withAsterisk maxLength={2} {...bind(form, "venueCountry")} />
          <TextInput label="Time zone" description="IANA name, for example Europe/Berlin" withAsterisk list={timezoneListId} autoComplete="off" {...bind(form, "venueTimezone")} />
          <datalist id={timezoneListId}>
            {commonTimezones.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
        </>
      )}
    </Stack>
  );
}
