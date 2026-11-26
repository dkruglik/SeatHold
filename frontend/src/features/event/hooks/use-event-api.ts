import { useMemo } from "react";
import { useApiClient } from "../../../app/api-client-context";
import { EventApi } from "../services/event-api";

export function useEventApi(): EventApi {
  const client = useApiClient();
  return useMemo(() => new EventApi(client), [client]);
}
