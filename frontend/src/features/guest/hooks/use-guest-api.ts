import { useMemo } from "react";
import { useApiClient } from "../../../app/api-client-context";
import { GuestApi } from "../services/guest-api";

export function useGuestApi(): GuestApi {
  const client = useApiClient();
  return useMemo(() => new GuestApi(client), [client]);
}
