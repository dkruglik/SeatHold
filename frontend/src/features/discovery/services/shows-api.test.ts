import { describe, expect, it, vi } from "vitest";
import { ApiClient } from "../../../shared/lib/api-client";
import { ShowsApi } from "./shows-api";

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

function setup(body: unknown) {
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => json(body));
  return { fetchImpl, api: new ShowsApi(new ApiClient({ apiBaseUrl: "/api" }, fetchImpl)) };
}

const result = { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };

describe("ShowsApi", () => {
  it("search calls GET /shows with only the given params", async () => {
    const { api, fetchImpl } = setup(result);

    await expect(api.search(new URLSearchParams("type=Concert&page=2"))).resolves.toEqual(result);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/shows?type=Concert&page=2");
  });

  it("search without params calls GET /shows with no query string", async () => {
    const { api, fetchImpl } = setup(result);

    await api.search(new URLSearchParams());

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/shows");
  });

  it("search rejects a body that is not a search result", async () => {
    await expect(setup({ items: "nope" }).api.search(new URLSearchParams())).rejects.toThrowError(/unexpected/i);
  });

  it("facets calls GET /shows/facets and returns the lists", async () => {
    const facets = { types: ["Concert"], genres: [], countries: ["DE"], cities: [], venues: [{ id: "v", name: "Hall", city: "Berlin" }] };
    const { api, fetchImpl } = setup(facets);

    await expect(api.facets()).resolves.toEqual(facets);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("/api/shows/facets");
  });

  it("facets rejects a body that is not facets", async () => {
    await expect(setup({ types: [] }).api.facets()).rejects.toThrowError(/unexpected/i);
  });
});
