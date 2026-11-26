import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, type RouteObject } from "react-router";
import { ApiClient } from "../shared/lib/api-client";
import { ApiClientProvider } from "./api-client-context";
import { App } from "./app";
import { loadFrontendConfig } from "./config/load-frontend-config";
import { routes } from "./router";

/** Loads the config (throws on an invalid value: fail fast), builds the one ApiClient and renders the app. */
export function bootstrap(env: Readonly<Record<string, unknown>>, container: HTMLElement, routeList: RouteObject[] = routes): void {
  const client = new ApiClient(loadFrontendConfig(env));
  createRoot(container).render(
    <StrictMode>
      <ApiClientProvider client={client}>
        <App router={createBrowserRouter(routeList)} />
      </ApiClientProvider>
    </StrictMode>,
  );
}
