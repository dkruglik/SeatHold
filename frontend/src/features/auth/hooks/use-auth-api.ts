import { useMemo } from "react";
import { useApiClient } from "../../../app/api-client-context";
import { AuthApi } from "../services/auth-api";

export function useAuthApi(): AuthApi {
  const client = useApiClient();
  return useMemo(() => new AuthApi(client), [client]);
}
