import { createContext, useContext, type ReactNode } from "react";
import type { ApiClient } from "../shared/lib/api-client";

const ApiClientContext = createContext<ApiClient | null>(null);

export function ApiClientProvider({ client, children }: { readonly client: ApiClient; readonly children: ReactNode }) {
  return <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>;
}

/** The one ApiClient of the app (rule 31): features call the backend through it, never with fetch directly. */
export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (client === null) {
    throw new Error("useApiClient must be used inside an ApiClientProvider");
  }
  return client;
}
