import { useMemo } from "react";
import { useApiClient } from "../../../app/api-client-context";
import { ShowsApi } from "../services/shows-api";

export function useShowsApi(): ShowsApi {
  const client = useApiClient();
  return useMemo(() => new ShowsApi(client), [client]);
}
