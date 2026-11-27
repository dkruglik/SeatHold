import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { AuthUser } from "../types";
import { useAuthApi } from "./use-auth-api";

export const meQueryKey = ["auth", "me"] as const;

/** Who is signed in. `data` is the user, or `null` for an anonymous visitor. Server state only: nothing is stored in the browser. */
export function useMe(): UseQueryResult<AuthUser | null> {
  const api = useAuthApi();
  return useQuery({ queryKey: meQueryKey, queryFn: () => api.getMe(), retry: false, staleTime: 60_000 });
}
