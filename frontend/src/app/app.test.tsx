import { render, screen } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { ApiClient } from "../shared/lib/api-client";
import { createFakeBackend } from "../test/fake-backend";
import { ApiClientProvider } from "./api-client-context";
import { App } from "./app";
import { routes } from "./router";

function renderAt(path: string) {
  const client = new ApiClient({ apiBaseUrl: "/api" }, createFakeBackend().fetchImpl);
  return render(
    <ApiClientProvider client={client}>
      <App router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </ApiClientProvider>,
  );
}

describe("App", () => {
  it("renders the home placeholder inside the Mantine provider with landmarks", () => {
    renderAt("/");

    screen.getByRole("heading", { level: 1, name: "SeatHolder" });
    screen.getByRole("banner");
    screen.getByRole("main");
    // Mantine's provider sets the color scheme attribute on the document root.
    expect(document.documentElement.hasAttribute("data-mantine-color-scheme")).toBe(true);
  });

  it("makes TanStack Query available to routes", async () => {
    const { useQueryClient } = await import("@tanstack/react-query");
    let found = false;
    function Probe() {
      found = useQueryClient() !== undefined;
      return null;
    }
    render(<App router={createMemoryRouter([{ path: "/", element: <Probe /> }])} />);

    expect(found).toBe(true);
  });
});
