import { describe, expect, it } from "vitest";
import { buildEventFilters, escapeLike } from "./event-search-sql.js";

const base = { offset: 0, limit: 20, now: new Date("2030-01-01T00:00:00Z") };

describe("escapeLike", () => {
  it("escapes %, _ and the backslash", () => {
    expect(escapeLike("100%_a\\b")).toBe("100\\%\\_a\\\\b");
  });
});

describe("buildEventFilters", () => {
  it("is TRUE without filters", () => {
    expect(buildEventFilters(base).sql).toBe("TRUE");
  });

  it("binds every value and never puts user text into the SQL", () => {
    const filter = buildEventFilters({ ...base, q: "x'; DROP TABLE shows;--", type: "t", genre: "g", country: "DE", city: "c", venueId: "u", from: base.now, to: base.now });
    expect(filter.text).not.toContain("DROP");
    expect(filter.values).toContain("%x'; DROP TABLE shows;--%");
    expect(filter.text.match(/\$\d+/g)).toHaveLength(filter.values.length);
  });
});
