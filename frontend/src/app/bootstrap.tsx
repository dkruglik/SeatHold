import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, type RouteObject } from "react-router";
import { ApiClient } from "../shared/lib/api-client";
import { ApiClientProvider } from "./api-client-context";
import { App } from "./app";
import { FrontendConfigProvider } from "./config/config-context";
import { loadFrontendConfig } from "./config/load-frontend-config";
import { routes } from "./router";

/** Loads the config (throws on an invalid value: fail fast), builds the one ApiClient and renders the app. */
export function bootstrap(env: Readonly<Record<string, unknown>>, container: HTMLElement, routeList: RouteObject[] = routes): void {
  const config = loadFrontendConfig(env);
  const client = new ApiClient(config);
  createRoot(container).render(
    <StrictMode>
      <FrontendConfigProvider config={config}>
        <ApiClientProvider client={client}>
          <App router={createBrowserRouter(routeList)} />
        </ApiClientProvider>
      </FrontendConfigProvider>
    </StrictMode>,
  );
}
