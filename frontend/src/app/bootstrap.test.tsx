import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrap } from "./bootstrap";
import { useApiClient } from "./api-client-context";

function Probe() {
  const client = useApiClient();
  void client.get("/probe");
  return <p>probe rendered</p>;
}

// A fresh response per call: StrictMode renders the probe twice, and a body can be read once.
function jsonOk(): Response {
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
}

function rootElement(): HTMLElement {
  const element = document.createElement("div");
  document.body.append(element);
  return element;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("bootstrap", () => {
  it("renders the app with an API client that uses the configured base path", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(jsonOk()));
    vi.stubGlobal("fetch", fetchMock);

    bootstrap({ VITE_API_BASE_URL: "/service/api" }, rootElement(), [{ path: "/", element: <Probe /> }]);

    await screen.findByText("probe rendered");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/service/api/probe");
  });

  it("falls back to the same-origin /api when VITE_API_BASE_URL is unset", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(jsonOk()));
    vi.stubGlobal("fetch", fetchMock);

    bootstrap({}, rootElement(), [{ path: "/", element: <Probe /> }]);

    await screen.findByText("probe rendered");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/probe");
  });

  it("renders the real routes by default", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(new Response('{"user":null}', { status: 200 }))));
    bootstrap({}, rootElement());

    await screen.findByRole("heading", { level: 1, name: "SeatHolder" });
  });

  it("fails fast on an absolute VITE_API_BASE_URL, naming the variable and not the value", () => {
    const attempt = () => bootstrap({ VITE_API_BASE_URL: "https://evil.example/api" }, rootElement());

    expect(attempt).toThrowError(/VITE_API_BASE_URL/);
    expect(attempt).not.toThrowError(/evil\.example/);
  });
});

describe("useApiClient", () => {
  it("throws outside an ApiClientProvider", async () => {
    const { renderHook } = await import("@testing-library/react");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => renderHook(() => useApiClient())).toThrowError(/ApiClientProvider/);
    quiet.mockRestore();
  });
});
