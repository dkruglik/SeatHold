import { Alert, Button, Group, Pagination, Skeleton, Stack, Text } from "@mantine/core";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ShowSearchResult } from "../types";
import { ShowRow } from "./show-row";

export function ResultsSkeleton() {
  return (
    <Stack role="status" aria-label="Loading events" gap="sm">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} height={96} radius="md" />
      ))}
    </Stack>
  );
}

export function ResultsError({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <Alert color="red" role="alert" title="Could not load events">
      <Group gap="sm" wrap="wrap">
        <Text size="sm">Something went wrong while loading the events.</Text>
        <Button variant="default" size="compact-md" onClick={onRetry}>
          Retry
        </Button>
      </Group>
    </Alert>
  );
}

export function ResultsEmpty({ onClear }: { readonly onClear: () => void }) {
  return (
    <Stack align="flex-start" gap="sm">
      <Text fw={600}>No events match your filters</Text>
      <Button variant="default" onClick={onClear}>
        Clear filters
      </Button>
    </Stack>
  );
}

const controlLabels = { first: "First page", previous: "Previous page", next: "Next page", last: "Last page" } as const;

interface ResultsProps {
  readonly search: UseQueryResult<ShowSearchResult>;
  readonly page: number;
  readonly onPage: (page: number) => void;
  readonly onClear: () => void;
}

/** Loading, error, empty, or the list with its pagination. While the next page loads the current one stays, marked busy. */
export function Results({ search, page, onPage, onClear }: ResultsProps) {
  if (search.isError) {
    return <ResultsError onRetry={() => void search.refetch()} />;
  }
  if (search.data === undefined) {
    return <ResultsSkeleton />;
  }
  const { items, totalPages } = search.data;
  if (items.length === 0) {
    return <ResultsEmpty onClear={onClear} />;
  }
  return (
    <Stack gap="md" aria-busy={search.isPlaceholderData}>
      <Stack component="ul" gap="sm" p={0} m={0} style={{ opacity: search.isPlaceholderData ? 0.6 : 1 }}>
        {items.map((item) => (
          <ShowRow key={item.eventId} item={item} />
        ))}
      </Stack>
      {totalPages > 1 && (
        <Pagination
          total={totalPages}
          value={page}
          onChange={onPage}
          getControlProps={(control) => ({ "aria-label": controlLabels[control] })}
        />
      )}
    </Stack>
  );
}
