import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { Facets } from "../types";
import { useShowsApi } from "./use-shows-api";

/** The values of the filter dropdowns. They change rarely, so they are kept for five minutes. */
export function useFacets(): UseQueryResult<Facets> {
  const api = useShowsApi();
  return useQuery({ queryKey: ["shows", "facets"], queryFn: () => api.facets(), staleTime: 300_000, retry: false });
}
