import { describe, expect, it } from "vitest";
import { patchFilters, readFilters, toApiQuery } from "./search-params";

const uuid = "3f1c1d0e-8a57-4a39-9a43-5f0b8f6f2f11";

describe("readFilters", () => {
  it("reads every filter from the URL with the API's parameter names", () => {
    const params = new URLSearchParams(
      `q=rock&type=Concert&genre=Pop&country=DE&city=Berlin&venueId=${uuid}&from=2026-03-01T00:00:00.000Z&to=2026-03-02T00:00:00.000Z&page=3`,
    );

    expect(readFilters(params)).toEqual({
      q: "rock", type: "Concert", genre: "Pop", country: "DE", city: "Berlin", venueId: uuid,
      from: "2026-03-01T00:00:00.000Z", to: "2026-03-02T00:00:00.000Z", page: 3,
    });
  });

  it("is empty for an empty URL, with page 1", () => {
    expect(readFilters(new URLSearchParams())).toEqual({ page: 1 });
  });

  it("ignores junk: bad page, empty values, bad country, bad venue id, bad dates, unknown params", () => {
    const params = new URLSearchParams("page=abc&q=&type=%20&country=Germany&venueId=nope&from=yesterday&to=2026-13-45&evil=1&pageSize=500");

    expect(readFilters(params)).toEqual({ page: 1 });
  });

  it.each(["0", "-2", "1.5", "100001", "1e3"])("normalizes page %s to 1", (page) => {
    expect(readFilters(new URLSearchParams({ page })).page).toBe(1);
  });

  it("drops an inverted range (to before from) so the API never answers 400", () => {
    const filters = readFilters(new URLSearchParams("from=2026-03-02T00:00:00.000Z&to=2026-03-01T00:00:00.000Z"));

    expect(filters.from).toBe("2026-03-02T00:00:00.000Z");
    expect(filters.to).toBeUndefined();
  });

  it("trims q and cuts it to the API maximum of 100 characters", () => {
    expect(readFilters(new URLSearchParams({ q: `  ${"x".repeat(150)}  ` })).q).toBe("x".repeat(100));
  });
});

describe("toApiQuery", () => {
  it("sends only what is set, and no page for page 1", () => {
    expect(toApiQuery({ page: 1 }).toString()).toBe("");
    expect(toApiQuery({ type: "Concert", page: 2 }).toString()).toBe("type=Concert&page=2");
  });
});

describe("patchFilters", () => {
  it("sets a value, resets the page, and keeps the other filters", () => {
    const next = patchFilters(new URLSearchParams("type=Concert&page=4"), { genre: "Pop" });

    expect(next.toString()).toBe("type=Concert&genre=Pop");
  });

  it("removes a param when the value is undefined or empty", () => {
    expect(patchFilters(new URLSearchParams("type=Concert&genre=Pop"), { type: undefined, genre: "" }).toString()).toBe("");
  });

  it("sets an explicit page (omitted for page 1) without touching the filters", () => {
    expect(patchFilters(new URLSearchParams("type=Concert"), {}, 3).toString()).toBe("type=Concert&page=3");
    expect(patchFilters(new URLSearchParams("type=Concert&page=3"), {}, 1).toString()).toBe("type=Concert");
  });

  it("drops unknown params from the URL it writes", () => {
    expect(patchFilters(new URLSearchParams("evil=1&type=Concert"), { genre: "Pop" }).toString()).toBe("type=Concert&genre=Pop");
  });
});
