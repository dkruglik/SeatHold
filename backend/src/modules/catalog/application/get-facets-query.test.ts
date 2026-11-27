import { describe, expect, it } from "vitest";
import { ControlledClock } from "../../../shared/time/controlled-clock.js";
import { GetFacetsQuery } from "./get-facets-query.js";

describe("GetFacetsQuery", () => {
  it("returns sorted distinct values derived from the stored kinds and venues", async () => {
    const reader = {
      read: () =>
        Promise.resolve({
          showKinds: [{ type: "theatre", genre: "drama" }, { type: "concert", genre: "rock" }, { type: "concert", genre: "jazz" }],
          venues: [
            { id: "2", name: "Zeta", city: "Berlin", countryCode: "DE" },
            { id: "1", name: "Alpha", city: "Berlin", countryCode: "DE" },
            { id: "3", name: "Alpha", city: "London", countryCode: "GB" },
          ],
        }),
    };
    const facets = await new GetFacetsQuery({ reader, clock: new ControlledClock(new Date()) }).execute();
    expect(facets).toEqual({
      types: ["concert", "theatre"],
      genres: ["drama", "jazz", "rock"],
      countries: ["DE", "GB"],
      cities: ["Berlin", "London"],
      venues: [{ id: "1", name: "Alpha", city: "Berlin" }, { id: "3", name: "Alpha", city: "London" }, { id: "2", name: "Zeta", city: "Berlin" }],
    });
  });
});
