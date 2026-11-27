import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { berlinEvent, failure, json, lookups } from "./admin-test-kit";
import { created, futureLocal, post, setup } from "./create-event-test-kit";

describe("Create event form submit", () => {
  it("posts an existing show and venue with the price in minor units and the start as an ISO instant, then opens the event", async () => {
    const { user, field, fillCommon, submit, callsTo, router } = await setup();
    await user.selectOptions(field(/^Show( \*)?$/), lookups.shows[0]?.id ?? "");
    await user.selectOptions(field(/^Venue( \*)?$/), lookups.venues[0]?.id ?? "");
    await fillCommon();
    await submit();

    await waitFor(() => expect(router.state.location.pathname).toBe(`/admin/events/${berlinEvent.eventId}`));
    const [call] = callsTo("POST", "/api/admin/events");
    expect(call?.csrfToken).toBe("token-1");
    expect(call?.body).toEqual({
      show: { existingId: lookups.shows[0]?.id }, venue: { existingId: lookups.venues[0]?.id },
      startsAt: new Date(futureLocal).toISOString(), priceMinor: 4550, currency: "EUR", rows: 10, seatsPerRow: 20,
    });
  });
  it("posts a new show and a new venue", async () => {
    const { user, field, setText, fillCommon, submit, callsTo } = await setup();
    await user.selectOptions(field(/^Show( \*)?$/), "__new__");
    await setText(/^Title/, "Opera Night");
    await setText(/^Type/, "opera");
    await setText(/^Genre/, "classical");
    await user.type(field(/^Description/), "An evening");
    await user.selectOptions(field(/^Venue( \*)?$/), "__new__");
    await setText(/^Venue name/, "Hall");
    await setText(/^City/, "Vienna");
    await setText(/^Country code/, "at");
    await setText(/^Time zone/, "Europe/Vienna");
    await fillCommon();
    await setText(/^Currency/, "usd");
    await submit();

    await waitFor(() => expect(callsTo("POST", "/api/admin/events")).toHaveLength(1));
    expect(callsTo("POST", "/api/admin/events")[0]?.body).toMatchObject({
      show: { new: { title: "Opera Night", type: "opera", genre: "classical", description: "An evening" } },
      venue: { new: { name: "Hall", city: "Vienna", countryCode: "AT", timezone: "Europe/Vienna" } },
      currency: "USD",
    });
  });
});

describe("Create event form failures", () => {
  it("shows the server message on 400 and which reference vanished on 404", async () => {
    let status = 400;
    const { user, field, fillCommon, submit } = await setup(post(() => (status === 400 ? failure(400, "INVALID_EVENT", "rows must be an integer from 1 to 200") : failure(404, "VENUE_NOT_FOUND"))));
    await user.selectOptions(field(/^Show( \*)?$/), lookups.shows[0]?.id ?? "");
    await user.selectOptions(field(/^Venue( \*)?$/), lookups.venues[0]?.id ?? "");
    await fillCommon();
    await submit();

    expect((await screen.findByRole("alert")).textContent).toContain("rows must be an integer from 1 to 200");
    status = 404;
    await submit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("The venue no longer exists"));
  });
  it("shows a fixed venue alert on 409 VENUE_CONFLICT, keeps the values and allows another submit", async () => {
    const { user, field, setText, fillCommon, submit, callsTo } = await setup(post(() => failure(409, "VENUE_CONFLICT", "server text")));
    await user.selectOptions(field(/^Show( \*)?$/), lookups.shows[0]?.id ?? "");
    await user.selectOptions(field(/^Venue( \*)?$/), "__new__");
    await setText(/^Venue name/, "Arena One");
    await setText(/^City/, "Berlin");
    await setText(/^Country code/, "fr");
    await setText(/^Time zone/, "Europe/Paris");
    await fillCommon();
    await submit();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("A venue with this name and city already exists with a different country or time zone. Select the existing venue instead.");
    expect(alert.textContent).not.toContain("server text");
    expect((field(/^Venue name/) as HTMLInputElement).value).toBe("Arena One");
    expect((field(/^Time zone/) as HTMLInputElement).value).toBe("Europe/Paris");
    expect((field(/^Price/) as HTMLInputElement).value).toBe("45.50");
    expect((screen.getByRole("button", { name: "Create event" }) as HTMLButtonElement).disabled).toBe(false);
    await submit();
    await waitFor(() => expect(callsTo("POST", "/api/admin/events")).toHaveLength(2));
  });
  it("posts once when the button is double-clicked", async () => {
    const { user, field, fillCommon, callsTo } = await setup(post(() => new Promise<Response>((resolve) => setTimeout(() => resolve(json(created, 201)), 30))));
    await user.selectOptions(field(/^Show( \*)?$/), lookups.shows[0]?.id ?? "");
    await user.selectOptions(field(/^Venue( \*)?$/), lookups.venues[0]?.id ?? "");
    await fillCommon();
    await user.dblClick(screen.getByRole("button", { name: "Create event" }));

    await waitFor(() => expect(callsTo("POST", "/api/admin/events")).toHaveLength(1));
    expect(within(document.body).queryAllByRole("alert")).toHaveLength(0);
  });
});
