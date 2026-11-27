import { describe, expect, it } from "vitest";
import { ValidationError } from "../../../shared/errors/app-error.js";
import { ControlledClock } from "../../../shared/time/controlled-clock.js";
import type { EventSearchCriteria, EventSearchReader } from "./ports/event-search-reader.js";
import { SEARCH_OFFSET_LIMIT, SearchEventsQuery } from "./search-events-query.js";

const NOW = new Date("2030-06-01T12:00:00.000Z");

function setup(total = 0) {
  const calls: EventSearchCriteria[] = [];
  const reader: EventSearchReader = {
    search: (criteria) => {
      calls.push(criteria);
      return Promise.resolve({ rows: [], total });
    },
  };
  return { calls, query: new SearchEventsQuery({ reader, clock: new ControlledClock(NOW) }) };
}

describe("SearchEventsQuery", () => {
  it("lists only events after now when no from is given, and passes now for the seat count", async () => {
    const { calls, query } = setup();
    await query.execute({ page: 1, pageSize: 20 });
    expect(calls[0]).toEqual({ after: NOW, offset: 0, limit: 20, now: NOW });
  });

  it("uses from as an inclusive bound instead of now when given", async () => {
    const { calls, query } = setup();
    const from = new Date("2020-01-01T00:00:00.000Z");
    await query.execute({ from, page: 1, pageSize: 20 });
    expect(calls[0]?.from).toEqual(from);
    expect(calls[0]?.after).toBeUndefined();
  });

  it("rejects from after to, and accepts from equal to to", async () => {
    const { query } = setup();
    const a = new Date("2030-07-01T00:00:00.000Z");
    await expect(query.execute({ from: new Date(a.getTime() + 1), to: a, page: 1, pageSize: 20 })).rejects.toBeInstanceOf(ValidationError);
    await expect(query.execute({ from: a, to: a, page: 1, pageSize: 20 })).resolves.toBeDefined();
  });

  it("upper-cases the country, trims q and drops a blank q", async () => {
    const { calls, query } = setup();
    await query.execute({ country: "de", q: "  rock ", page: 1, pageSize: 20 });
    await query.execute({ q: "   ", page: 1, pageSize: 20 });
    expect(calls[0]).toMatchObject({ country: "DE", q: "rock" });
    expect(calls[1]).not.toHaveProperty("q");
  });

  it("turns page and pageSize into an offset and reports the page count", async () => {
    const { calls, query } = setup(41);
    const result = await query.execute({ page: 3, pageSize: 20 });
    expect(calls[0]).toMatchObject({ offset: 40, limit: 20 });
    expect(result).toMatchObject({ total: 41, page: 3, pageSize: 20, totalPages: 3 });
  });
});

describe("SearchEventsQuery page depth", () => {
  it("accepts the last allowed offset and rejects the first disallowed one with PAGE_TOO_DEEP", async () => {
    const { calls, query } = setup();
    await expect(query.execute({ page: 200, pageSize: 50 })).resolves.toBeDefined(); // offset 9,950
    await expect(query.execute({ page: SEARCH_OFFSET_LIMIT, pageSize: 1 })).resolves.toBeDefined(); // offset 9,999
    const reads = calls.length;

    await expect(query.execute({ page: 201, pageSize: 50 })).rejects.toThrow(expect.objectContaining({ publicCode: "PAGE_TOO_DEEP" }));
    await expect(query.execute({ page: SEARCH_OFFSET_LIMIT + 1, pageSize: 1 })).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toHaveLength(reads);
  });

  it("caps totalPages at the last reachable page and keeps the real total", async () => {
    const { query } = setup(50_000);
    const result = await query.execute({ page: 1, pageSize: 50 });
    expect(result).toMatchObject({ total: 50_000, totalPages: 200 });
  });

  it("keeps the plain page count while it is below the cap", async () => {
    const { query } = setup(9_990);
    expect((await query.execute({ page: 1, pageSize: 30 })).totalPages).toBe(333);
  });
});
