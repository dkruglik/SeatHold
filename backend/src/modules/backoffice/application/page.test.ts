import { describe, expect, it } from "vitest";
import { ValidationError } from "../../../shared/errors/app-error.js";
import { EVENT_LIST_OFFSET_LIMIT, TICKET_LIST_OFFSET_LIMIT, pagedOf, windowOf } from "./page.js";

describe("pagedOf", () => {
  it("caps totalPages at the last reachable page and keeps the real total", () => {
    const events = pagedOf({ page: 1, pageSize: 50 }, [], 50_000, EVENT_LIST_OFFSET_LIMIT);
    expect(events).toMatchObject({ total: 50_000, totalPages: 200 });
    const tickets = pagedOf({ page: 1, pageSize: 100 }, [], 50_000, TICKET_LIST_OFFSET_LIMIT);
    expect(tickets).toMatchObject({ total: 50_000, totalPages: 200 });
  });

  it("keeps the plain page count below the cap and 0 for no rows", () => {
    expect(pagedOf({ page: 1, pageSize: 20 }, [], 45, EVENT_LIST_OFFSET_LIMIT).totalPages).toBe(3);
    expect(pagedOf({ page: 1, pageSize: 20 }, [], 0, EVENT_LIST_OFFSET_LIMIT).totalPages).toBe(0);
  });
});

describe("windowOf", () => {
  it("passes the last allowed offset and rejects the first disallowed one with PAGE_TOO_DEEP", () => {
    expect(windowOf({ page: 200, pageSize: 50 }, EVENT_LIST_OFFSET_LIMIT)).toEqual({ offset: 9_950, limit: 50 });
    expect(() => windowOf({ page: 201, pageSize: 50 }, EVENT_LIST_OFFSET_LIMIT)).toThrow(ValidationError);
    expect(() => windowOf({ page: 201, pageSize: 50 }, EVENT_LIST_OFFSET_LIMIT)).toThrow(expect.objectContaining({ publicCode: "PAGE_TOO_DEEP" }));
  });
});
