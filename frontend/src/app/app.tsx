import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { RouterProvider, type DataRouter } from "react-router";
import { cssVariablesResolver, theme } from "./theme";

export function App({ router }: { readonly router: DataRouter }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <MantineProvider theme={theme} defaultColorScheme="auto" cssVariablesResolver={cssVariablesResolver}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </MantineProvider>
  );
}
