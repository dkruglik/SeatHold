import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { desktopViewport, narrowViewport, setViewport } from "../../test/viewport";
import { makeServer, renderEvent } from "./event-test-kit";

async function holdSeat() {
  const view = renderEvent(makeServer());
  await view.user.click(await screen.findByRole("button", { name: "Row A, seat 1, available" }));
  return view;
}

describe("EventPage on a narrow screen", () => {
  it("docks the countdown and the continue button in a bar once seats are held", async () => {
    setViewport(narrowViewport);
    await holdSeat();

    const bar = await screen.findByTestId("checkout-bar");
    expect(within(bar).getByRole("timer").textContent).toMatch(/Time left to pay: \d+:\d{2}/);
    const proceed = within(bar).getByRole("button", { name: "Continue to payment" });
    expect(proceed.getAttribute("data-size")).toBe("lg");
    expect(within(screen.getByRole("region", { name: "Your selection" })).queryByRole("button", { name: "Continue to payment" })).toBeNull();
  });

  it("has no bar before a hold exists", async () => {
    setViewport(narrowViewport);
    renderEvent(makeServer());

    await screen.findByRole("button", { name: "Row A, seat 1, available" });
    expect(screen.queryByTestId("checkout-bar")).toBeNull();
  });

  it("puts the checkout panel below the seat map", async () => {
    setViewport(narrowViewport);
    const { user } = await holdSeat();
    await user.click(await screen.findByRole("button", { name: "Continue to payment" }));

    const checkout = await screen.findByRole("region", { name: "Checkout" });
    const map = screen.getByRole("group", { name: "Seat map" });
    expect(map.compareDocumentPosition(checkout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Night Songs" })).toBeTruthy();
  });
});

describe("EventPage on a desktop screen", () => {
  it("shows the continue button in the side panel and no bar", async () => {
    setViewport(desktopViewport);
    await holdSeat();

    const panel = screen.getByRole("region", { name: "Your selection" });
    await within(panel).findByRole("timer");
    expect(within(panel).getByRole("button", { name: "Continue to payment" }).getAttribute("data-size")).not.toBe("lg");
    expect(screen.queryByTestId("checkout-bar")).toBeNull();
  });
});
