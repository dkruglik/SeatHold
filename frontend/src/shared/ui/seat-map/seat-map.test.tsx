import { MantineProvider } from "@mantine/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { theme } from "../../../app/theme";
import { SeatMap, type SeatMapSeat } from "./index";

const seats: SeatMapSeat[] = [
  { id: "a1", row: "A", number: 1, state: "available" },
  { id: "a2", row: "A", number: 2, state: "held" },
  { id: "b1", row: "B", number: 1, state: "sold" },
  { id: "b2", row: "B", number: 2, state: "held_by_me" },
];

function setup(over: { disabled?: boolean } = {}) {
  const onSelect = vi.fn();
  render(
    <MantineProvider theme={theme} env="test">
      <SeatMap rows={2} seatsPerRow={2} seats={seats} onSelect={onSelect} {...over} />
    </MantineProvider>,
  );
  return { onSelect, user: userEvent.setup() };
}

describe("SeatMap", () => {
  it("renders one group with an accessible name and a button per seat with the exact labels", () => {
    setup();

    expect(screen.getByRole("group", { name: "Seat map" })).toBeTruthy();
    for (const name of ["Row A, seat 1, available", "Row A, seat 2, held by someone else", "Row B, seat 1, sold", "Row B, seat 2, selected by you"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });

  it("shows a label on both sides of each row", () => {
    setup();

    const map = screen.getByRole("group", { name: "Seat map" });
    expect(within(map).getAllByText("A")).toHaveLength(2);
    expect(within(map).getAllByText("B")).toHaveLength(2);
  });

});

describe("SeatMap activation", () => {
  it("calls onSelect with the seat on click, Enter and Space of an available seat", async () => {
    const { onSelect, user } = setup();
    const seat = screen.getByRole("button", { name: "Row A, seat 1, available" });

    await user.click(seat);
    seat.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onSelect).toHaveBeenCalledTimes(3);
    expect(onSelect).toHaveBeenCalledWith(seats[0]);
  });

  it("does not call onSelect for sold or others' held seats, and marks them aria-disabled", async () => {
    const { onSelect, user } = setup();
    const held = screen.getByRole("button", { name: "Row A, seat 2, held by someone else" });
    const sold = screen.getByRole("button", { name: "Row B, seat 1, sold" });

    await user.click(held);
    await user.click(sold);
    sold.focus();
    await user.keyboard("{Enter}");

    expect(onSelect).not.toHaveBeenCalled();
    expect(held.getAttribute("aria-disabled")).toBe("true");
    expect(sold.getAttribute("aria-disabled")).toBe("true");
  });

  it("marks my seat aria-pressed and calls onSelect so it can be released", async () => {
    const { onSelect, user } = setup();
    const mine = screen.getByRole("button", { name: "Row B, seat 2, selected by you" });

    expect(mine.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Row A, seat 1, available" }).getAttribute("aria-pressed")).toBe("false");
    await user.click(mine);

    expect(onSelect).toHaveBeenCalledWith(seats[3]);
  });

  it("makes every seat inert when disabled", async () => {
    const { onSelect, user } = setup({ disabled: true });
    const seat = screen.getByRole("button", { name: "Row A, seat 1, available" });

    await user.click(seat);

    expect(onSelect).not.toHaveBeenCalled();
    expect(seat.getAttribute("aria-disabled")).toBe("true");
  });

});

describe("SeatMap legend", () => {
  it("has a legend naming the four states, each with its own marker shape or glyph", () => {
    setup();

    const legend = screen.getByRole("list", { name: "Seat legend" });
    const items = within(legend).getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual(["Available", "Held by someone else", "Sold", "Selected by you"]);
  });

  it("draws the four states with different markers, not by color alone", () => {
    setup();

    const marker = (name: string) => screen.getByRole("button", { name }).getAttribute("data-marker");
    const markers = [
      marker("Row A, seat 1, available"),
      marker("Row A, seat 2, held by someone else"),
      marker("Row B, seat 1, sold"),
      marker("Row B, seat 2, selected by you"),
    ];
    expect(new Set(markers).size).toBe(4);
  });
});
