import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { toApiQuery } from "../lib/search-params";
import type { SearchFilters, ShowSearchResult } from "../types";
import { useShowsApi } from "./use-shows-api";

/** Server state of the result page. The previous page stays on screen while the next one loads. */
export function useShowSearch(filters: SearchFilters): UseQueryResult<ShowSearchResult> {
  const api = useShowsApi();
  const query = toApiQuery(filters);
  return useQuery({
    queryKey: ["shows", "search", query.toString()],
    queryFn: () => api.search(query),
    placeholderData: keepPreviousData,
    retry: false,
  });
}
