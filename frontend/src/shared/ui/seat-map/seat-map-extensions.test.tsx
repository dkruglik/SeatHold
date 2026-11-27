import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { theme } from "../../../app/theme";
import { SeatMap, type SeatMapSeat } from "./index";

const seat = (row: string, number: number, state: SeatMapSeat["state"] = "available"): SeatMapSeat => ({ id: `${row}${number}`, row, number, state });
// Row B has a gap at seat 2.
const initial: SeatMapSeat[] = [
  seat("A", 1), seat("A", 2), seat("A", 3), seat("A", 4),
  seat("B", 1), seat("B", 3, "sold"), seat("B", 4, "held_by_me"),
  seat("C", 1), seat("C", 2, "held"), seat("C", 3), seat("C", 4),
];

function ui(seats: SeatMapSeat[], onSelect: (s: SeatMapSeat) => void, extra: { priceMinor?: number; currency?: string } = {}) {
  return (
    <MantineProvider theme={theme} env="test">
      <SeatMap rows={3} seatsPerRow={4} seats={seats} onSelect={onSelect} {...extra} />
    </MantineProvider>
  );
}

function setup(extra: { priceMinor?: number; currency?: string } = {}) {
  const onSelect = vi.fn();
  const view = render(ui(initial, onSelect, extra));
  return { onSelect, user: userEvent.setup(), rerender: (seats: SeatMapSeat[]) => view.rerender(ui(seats, onSelect, extra)) };
}

const seatEl = (name: string) => screen.getByRole("button", { name });

describe("legend", () => {
  it("is always visible and lists exactly the states the map shows", () => {
    setup();

    const items = within(screen.getByRole("list", { name: "Seat legend" })).getAllByRole("listitem");
    const markers = items.map((i) => i.getAttribute("data-marker")).sort();
    const shown = [...new Set(screen.getAllByRole("button").map((b) => b.getAttribute("data-marker")))].sort();
    expect(items.map((i) => i.textContent)).toEqual(["Available", "Held by someone else", "Sold", "Selected by you"]);
    expect(markers).toEqual(shown);
  });
});

describe("row labels", () => {
  it("shows each row label on both sides, hiding the right duplicate from assistive tech", () => {
    setup();

    const labels = within(screen.getByRole("group", { name: "Seat map" })).getAllByText("B");
    expect(labels).toHaveLength(2);
    expect(labels.filter((l) => l.getAttribute("aria-hidden") === "true")).toHaveLength(1);
  });
});

describe("tooltip", () => {
  it("shows seat, price and state on keyboard focus and hides on Escape and blur", async () => {
    const { user } = setup({ priceMinor: 4500, currency: "EUR" });

    await user.tab();

    const tip = screen.getByRole("tooltip");
    expect(tip.textContent).toBe("Row A, seat 1 · €45.00 · available");
    expect(seatEl("Row A, seat 1, available").getAttribute("aria-describedby")).toBe(tip.id);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tooltip").textContent).toBe("Row A, seat 2 · €45.00 · available");
    await user.tab();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows on hover and leaves price out when no price is given", async () => {
    const { user } = setup();

    await user.hover(seatEl("Row C, seat 2, held by someone else"));

    expect(screen.getByRole("tooltip").textContent).toBe("Row C, seat 2 · held by someone else");
    await user.unhover(seatEl("Row C, seat 2, held by someone else"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});

describe("keyboard navigation", () => {
  it("makes exactly one seat tabbable and Tab leaves the map after it", async () => {
    const { user } = setup();

    const tabbable = screen.getAllByRole("button").filter((b) => b.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
    await user.tab();
    expect(document.activeElement).toBe(seatEl("Row A, seat 1, available"));
    await user.tab();
    expect((document.activeElement as Element).getAttribute("role")).not.toBe("button");
  });

  it("moves focus and the tab stop with arrows, Home, End, PageUp and PageDown", async () => {
    const { user } = setup();
    await user.tab();

    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(document.activeElement).toBe(seatEl("Row A, seat 3, available"));
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(seatEl("Row B, seat 3, sold"));
    expect(screen.getAllByRole("button").filter((b) => b.getAttribute("tabindex") === "0")).toEqual([document.activeElement]);
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(seatEl("Row B, seat 1, available"));
    await user.keyboard("{End}");
    expect(document.activeElement).toBe(seatEl("Row B, seat 4, selected by you"));
    await user.keyboard("{Home}");
    expect(document.activeElement).toBe(seatEl("Row B, seat 1, available"));
    await user.keyboard("{PageDown}");
    expect(document.activeElement).toBe(seatEl("Row C, seat 1, available"));
    await user.keyboard("{PageUp}");
    expect(document.activeElement).toBe(seatEl("Row A, seat 1, available"));
    await user.keyboard("{ArrowUp}{ArrowLeft}");
    expect(document.activeElement).toBe(seatEl("Row A, seat 1, available"));
  });

});

describe("keyboard activation and refresh", () => {
  it("activates with Enter and Space the same way a click does, and never a sold seat", async () => {
    const { user, onSelect } = setup();
    await user.tab();

    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    await user.click(seatEl("Row A, seat 1, available"));
    expect(onSelect).toHaveBeenCalledTimes(3);
    expect(onSelect.mock.calls.map((c) => c[0])).toEqual([initial[0], initial[0], initial[0]]);

    onSelect.mockClear();
    seatEl("Row B, seat 3, sold").focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps focus on the same seat element, and the held-by-you seat, when the seats are refreshed", async () => {
    const { user, rerender } = setup();
    await user.tab();
    await user.keyboard("{ArrowRight}");
    const focused = document.activeElement;

    rerender(initial.map((s) => (s.id === "C3" ? { ...s, state: "held" as const } : s)));

    expect(document.activeElement).toBe(focused);
    expect((focused as Element).getAttribute("aria-label")).toBe("Row A, seat 2, available");
    expect(seatEl("Row C, seat 3, held by someone else")).toBeTruthy();
    expect(seatEl("Row B, seat 4, selected by you").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByRole("button").filter((b) => b.getAttribute("tabindex") === "0")).toEqual([focused]);
  });
});

describe("zoom and pan", () => {
  // jsdom applies Mantine's narrow-screen media query as display:none, so the buttons are looked up with hidden: true.
  const content = () => screen.getByTestId("zoom-content");

  it("zooms with the buttons, clamps at 3 and resets", async () => {
    const { user } = setup();
    expect(content().getAttribute("data-scale")).toBe("1");

    await user.click(screen.getByRole("button", { name: "Zoom in", hidden: true }));
    expect(content().getAttribute("data-scale")).toBe("1.5");
    expect(content().style.transform).toContain("scale(1.5)");
    await user.click(screen.getByRole("button", { name: "Zoom out", hidden: true }));
    expect(content().getAttribute("data-scale")).toBe("1");
    for (let i = 0; i < 5; i += 1) {
      await user.click(screen.getByRole("button", { name: "Zoom in", hidden: true }));
    }
    expect(content().getAttribute("data-scale")).toBe("3");
    await user.click(screen.getByRole("button", { name: "Reset view", hidden: true }));
    expect(content().getAttribute("data-scale")).toBe("1");
    expect(content().style.transform).toContain("scale(1)");
  });

  it("zooms with a two-pointer pinch", () => {
    setup();
    const wrapper = content().parentElement as HTMLElement;
    const pointer = (type: string, pointerId: number, clientX: number) =>
      fireEvent(wrapper, Object.assign(new MouseEvent(type, { bubbles: true, clientX, clientY: 0 }), { pointerId }));

    pointer("pointerdown", 1, 100);
    pointer("pointerdown", 2, 200);
    pointer("pointermove", 2, 300);

    expect(Number(content().getAttribute("data-scale"))).toBeCloseTo(2, 5);
    pointer("pointerup", 1, 100);
    pointer("pointerup", 2, 300);
  });
});
