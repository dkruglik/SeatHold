import { createContext, useContext, type ReactNode } from "react";
import { loadFrontendConfig, type FrontendConfig } from "./load-frontend-config";

// Without a provider (tests, isolated screens) the validated defaults apply.
const FrontendConfigContext = createContext<FrontendConfig>(loadFrontendConfig({}));

export function FrontendConfigProvider({ config, children }: { readonly config: FrontendConfig; readonly children: ReactNode }) {
  return <FrontendConfigContext.Provider value={config}>{children}</FrontendConfigContext.Provider>;
}

/** The config loaded once at startup (fail fast), for settings a screen needs besides the API base. */
export function useFrontendConfig(): FrontendConfig {
  return useContext(FrontendConfigContext);
}
