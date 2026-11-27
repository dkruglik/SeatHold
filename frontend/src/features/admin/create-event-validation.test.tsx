import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { lookups } from "./admin-test-kit";
import { setup } from "./create-event-test-kit";

describe("Create event form validation", () => {
  it("shows the live seat total and blocks a grid over 20,000 seats", async () => {
    const { user, field, setText, fillCommon, submit, callsTo } = await setup();
    await user.selectOptions(field(/^Show( \*)?$/), lookups.shows[0]?.id ?? "");
    await user.selectOptions(field(/^Venue( \*)?$/), lookups.venues[0]?.id ?? "");
    await fillCommon();
    await setText(/^Rows( \*)?$/, "150");
    await setText(/^Seats per row( \*)?$/, "150");

    expect(screen.getByText("Seats: 22,500 (max 20,000)")).toBeTruthy();
    await submit();

    expect(callsTo("POST", "/api/admin/events")).toHaveLength(0);
    expect(screen.getByText(/at most 20,000 seats/)).toBeTruthy();
  });
  it.each([
    ["Rows", "0", /Rows must be a whole number from 1 to 200/],
    ["Rows", "201", /Rows must be a whole number from 1 to 200/],
    ["Seats per row", "0", /Seats per row must be a whole number from 1 to 200/],
    ["Price", "-1", /Price must be a number/],
    ["Price", "abc", /Price must be a number/],
    ["Price", "10001", /Price must be at most/],
    ["Currency", "EU", /Currency must be 3 letters/],
  ])("rejects %s = %s without posting, marks the field invalid and focuses it", async (label, value, message) => {
    const { user, field, setText, fillCommon, submit, callsTo } = await setup();
    await user.selectOptions(field(/^Show( \*)?$/), lookups.shows[0]?.id ?? "");
    await user.selectOptions(field(/^Venue( \*)?$/), lookups.venues[0]?.id ?? "");
    await fillCommon();
    await setText(new RegExp(`^${label}`), value);
    await submit();

    const input = field(new RegExp(`^${label}`));
    expect(screen.getByText(message)).toBeTruthy();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(input);
    expect(callsTo("POST", "/api/admin/events")).toHaveLength(0);
  });
});

describe("Create event form cross-field validation", () => {
  it("rejects an unknown time zone and a start in the past", async () => {
    const { user, field, setText, fillCommon, submit, callsTo } = await setup();
    await user.selectOptions(field(/^Show( \*)?$/), lookups.shows[0]?.id ?? "");
    await user.selectOptions(field(/^Venue( \*)?$/), "__new__");
    await setText(/^Venue name/, "Hall");
    await setText(/^City/, "Vienna");
    await setText(/^Country code/, "AT");
    await setText(/^Time zone/, "Mars/Base");
    await fillCommon();
    fireEvent.change(field(/^Starts at/), { target: { value: "2020-01-01T10:00" } });
    await submit();

    expect(screen.getByText(/Time zone must be an IANA zone/)).toBeTruthy();
    expect(screen.getByText(/Start must be in the future/)).toBeTruthy();
    expect(callsTo("POST", "/api/admin/events")).toHaveLength(0);
  });
  it("requires a show and a venue choice", async () => {
    const { fillCommon, submit, callsTo } = await setup();
    await fillCommon();
    await submit();

    expect(screen.getByText("Choose a show or create a new one")).toBeTruthy();
    expect(screen.getByText("Choose a venue or create a new one")).toBeTruthy();
    expect(callsTo("POST", "/api/admin/events")).toHaveLength(0);
  });
});
