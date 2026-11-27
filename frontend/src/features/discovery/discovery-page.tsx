import { Container, Group, PageLayout, Stack, Text, Title } from "../../shared/ui";
import { useRef } from "react";
import { UserMenu } from "../auth";
import { FilterBar } from "./components/filter-bar";
import { Results } from "./components/results";
import { useDiscoveryFilters } from "./hooks/use-discovery-filters";
import { useFacets } from "./hooks/use-facets";
import { useShowSearch } from "./hooks/use-show-search";

/** The landing page: find an event. Filters and page live in the URL, so a link or a reload shows the same list. */
export function DiscoveryPage() {
  const state = useDiscoveryFilters();
  const facets = useFacets();
  const search = useShowSearch(state.filters);
  const resultsHeading = useRef<HTMLHeadingElement>(null);

  function changePage(page: number) {
    state.setPage(page);
    // Keep focus in the results and bring them into view, so the page change is not silent.
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView?.({ block: "start" });
  }

  return (
    <>
      <header>
        <Container size="lg" py="md">
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Text fw={700}>SeatHolder</Text>
            <UserMenu />
          </Group>
        </Container>
      </header>
      <main>
        <PageLayout title="Find a show">
          <Stack gap="lg">
            <FilterBar state={state} facets={facets.data} />
            <Title order={2} size="h3" ref={resultsHeading} tabIndex={-1}>
              Results
            </Title>
            <Results search={search} page={state.filters.page} onPage={changePage} onClear={state.clear} />
          </Stack>
        </PageLayout>
      </main>
    </>
  );
}
