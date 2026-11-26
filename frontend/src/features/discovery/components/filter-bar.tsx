import { Select, SimpleGrid, Stack, TextInput } from "@mantine/core";
import { DateTimeRangePicker } from "../../../shared/ui/date-time-range-picker";
import { useDebouncedQuery, type DiscoveryFilters } from "../hooks/use-discovery-filters";
import type { Facets } from "../types";

const noFacets: Facets = { types: [], genres: [], countries: [], cities: [], venues: [] };

/** The current value is always an option, so a value from the URL shows before (or without) the facets. */
function options(values: readonly string[], current: string | undefined): string[] {
  return current === undefined || values.includes(current) ? [...values] : [...values, current];
}

interface FilterSelectProps {
  readonly label: string;
  readonly data: readonly (string | { readonly value: string; readonly label: string })[];
  readonly value: string | undefined;
  readonly onChange: (value: string | undefined) => void;
}

function FilterSelect({ label, data, value, onChange }: FilterSelectProps) {
  return (
    <Select
      label={label}
      placeholder={`Any ${label.toLowerCase()}`}
      data={[...data]}
      value={value ?? null}
      onChange={(next) => onChange(next ?? undefined)}
      clearable
      searchable
      clearButtonProps={{ "aria-label": `Clear ${label.toLowerCase()}` }}
    />
  );
}

/** Stacks to one column on small screens, three on wide ones. Every change goes to the URL through `state`. */
export function FilterBar({ state, facets = noFacets }: { readonly state: DiscoveryFilters; readonly facets?: Facets | undefined }) {
  const { filters, setFilters } = state;
  const search = useDebouncedQuery(filters.q, (q) => setFilters({ q }, { replace: true }));
  const venues = facets.venues.map((v) => ({ value: v.id, label: `${v.name} (${v.city})` }));
  const venueData = filters.venueId === undefined || venues.some((v) => v.value === filters.venueId)
    ? venues
    : [...venues, { value: filters.venueId, label: filters.venueId }];

  return (
    <Stack component="form" role="search" aria-label="Filter events" gap="sm" onSubmit={(e) => e.preventDefault()}>
      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
        <TextInput
          type="search" label="Search" placeholder="Show title or venue"
          value={search.value} onChange={(e) => search.onChange(e.currentTarget.value)} maxLength={100}
        />
        <FilterSelect label="Type" data={options(facets.types, filters.type)} value={filters.type} onChange={(type) => setFilters({ type })} />
        <FilterSelect label="Genre" data={options(facets.genres, filters.genre)} value={filters.genre} onChange={(genre) => setFilters({ genre })} />
        <FilterSelect label="Country" data={options(facets.countries, filters.country)} value={filters.country} onChange={(country) => setFilters({ country })} />
        <FilterSelect label="City" data={options(facets.cities, filters.city)} value={filters.city} onChange={(city) => setFilters({ city })} />
        <FilterSelect label="Venue" data={venueData} value={filters.venueId} onChange={(venueId) => setFilters({ venueId })} />
      </SimpleGrid>
      <DateTimeRangePicker
        label="Date and time"
        value={{ from: filters.from ?? null, to: filters.to ?? null }}
        onChange={(range) => setFilters({ from: range.from ?? undefined, to: range.to ?? undefined })}
      />
    </Stack>
  );
}
