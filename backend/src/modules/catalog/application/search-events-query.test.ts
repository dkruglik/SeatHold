import { describe, expect, it } from "vitest";
import { ValidationError } from "../../../shared/errors/app-error.js";
import { ControlledClock } from "../../../shared/time/controlled-clock.js";
import type { EventSearchCriteria, EventSearchReader } from "./ports/event-search-reader.js";
import { SearchEventsQuery } from "./search-events-query.js";

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
