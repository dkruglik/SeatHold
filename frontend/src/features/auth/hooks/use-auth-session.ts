import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { AuthUser } from "../types";
import { meQueryKey } from "./use-me";

/** Moves the `me` state after a login or logout. A `me` fetch still in flight is cancelled so it cannot overwrite the new state. */
export function useAuthSession() {
  const queryClient = useQueryClient();
  const setUser = useCallback(
    async (user: AuthUser | null) => {
      await queryClient.cancelQueries({ queryKey: meQueryKey });
      queryClient.setQueryData(meQueryKey, user);
    },
    [queryClient],
  );
  return { signIn: setUser, signOut: useCallback(() => setUser(null), [setUser]) };
}
