import { describe, expect, it } from "vitest";
import { EventNotFound } from "../../catalog/index.js";
import { ControlledClock } from "../../../shared/time/controlled-clock.js";
import { GetLookupsQuery, LOOKUP_LIMIT } from "./get-lookups-query.js";
import { ListAdminEventsQuery } from "./list-admin-events-query.js";
import { ListBoughtTicketsQuery } from "./list-bought-tickets-query.js";
import { ListOpenTicketsQuery } from "./list-open-tickets-query.js";
import type { AdminEventListReader, AdminLookupsReader, EventTicketsReader } from "./ports/admin-readers.js";

const NOW = new Date("2030-01-01T10:00:00.000Z");
const clock = (): ControlledClock & { reads: number } => {
  const c = new ControlledClock(NOW) as ControlledClock & { reads: number };
  c.reads = 0;
  const original = c.now.bind(c);
  c.now = () => { c.reads += 1; return original(); };
  return c;
};
const header = { eventId: "e1", showTitle: "S", startsAt: NOW, venueName: "Hall", city: "Berlin", timezone: "Europe/Berlin" };

describe("ListAdminEventsQuery", () => {
  it("reads the clock once, passes now and the page window, and reports totalPages", async () => {
    const seen: unknown[] = [];
    const reader: AdminEventListReader = { list: (c) => { seen.push(c); return Promise.resolve({ total: 45, rows: [] }); } };
    const c = clock();

    const result = await new ListAdminEventsQuery({ reader, clock: c }).execute({ page: 3, pageSize: 20 });

    expect(c.reads).toBe(1);
    expect(seen).toEqual([{ now: NOW, offset: 40, limit: 20 }]);
    expect(result).toMatchObject({ total: 45, page: 3, pageSize: 20, totalPages: 3 });
  });
});

describe("GetLookupsQuery", () => {
  it("asks for at most LOOKUP_LIMIT of each list", async () => {
    const limits: number[] = [];
    const reader: AdminLookupsReader = { load: (limit) => { limits.push(limit); return Promise.resolve({ shows: [], venues: [] }); } };

    await new GetLookupsQuery({ reader }).execute();

    expect(limits).toEqual([LOOKUP_LIMIT]);
    expect(LOOKUP_LIMIT).toBe(500);
  });
});

describe("ListOpenTicketsQuery and ListBoughtTicketsQuery", () => {
  const reader = (found: boolean): EventTicketsReader & { calls: string[] } => {
    const calls: string[] = [];
    return {
      calls,
      findHeader: () => Promise.resolve(found ? header : null),
      listOpen: (c) => { calls.push(`open ${c.now.toISOString()} ${c.offset}/${c.limit}`); return Promise.resolve({ total: 0, rows: [] }); },
      listBought: (c) => { calls.push(`bought ${c.offset}/${c.limit}`); return Promise.resolve({ total: 120, rows: [] }); },
    };
  };

  it("passes the clock value and the window for open tickets", async () => {
    const r = reader(true);
    const c = clock();

    await new ListOpenTicketsQuery({ reader: r, clock: c }).execute({ eventId: "e1", page: 2, pageSize: 50 });

    expect(c.reads).toBe(1);
    expect(r.calls).toEqual([`open ${NOW.toISOString()} 50/50`]);
  });

  it("returns the event header and totalPages for bought tickets", async () => {
    const result = await new ListBoughtTicketsQuery({ reader: reader(true) }).execute({ eventId: "e1", page: 1, pageSize: 50 });

    expect(result).toMatchObject({ event: header, total: 120, totalPages: 3 });
  });

  it("throws EventNotFound for an unknown event, for both lists", async () => {
    await expect(new ListOpenTicketsQuery({ reader: reader(false), clock: clock() }).execute({ eventId: "x", page: 1, pageSize: 50 })).rejects.toBeInstanceOf(EventNotFound);
    await expect(new ListBoughtTicketsQuery({ reader: reader(false) }).execute({ eventId: "x", page: 1, pageSize: 50 })).rejects.toBeInstanceOf(EventNotFound);
  });
});
