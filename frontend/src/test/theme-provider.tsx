import { MantineProvider } from "@mantine/core";
import type { ReactNode } from "react";
import { cssVariablesResolver, theme } from "../app/theme";

/** The app theme without transitions, for feature test kits that must not import Mantine themselves. */
export function TestThemeProvider({ children }: { readonly children: ReactNode }) {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} env="test">
      {children}
    </MantineProvider>
  );
}
