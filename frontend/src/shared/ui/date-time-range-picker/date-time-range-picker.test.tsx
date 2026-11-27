import { MantineProvider } from "@mantine/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { theme } from "../../../app/theme";
import { DateTimeRangePicker, type DateTimeRange } from "./index";

const empty: DateTimeRange = { from: null, to: null };
const local = (y: number, m: number, d: number, h: number, mi: number) => new Date(y, m, d, h, mi).toISOString();

/** Two days in the current month (the calendar opens there when there is no value). */
const now = new Date();
const year = now.getFullYear();
const month = now.getMonth();
const dayButton = (d: number) => screen.getByRole("button", { name: dayjs(new Date(year, month, d)).format("D MMMM YYYY") });

function Controlled({ onEmit, initial = empty }: { onEmit: (v: DateTimeRange) => void; initial?: DateTimeRange }) {
  const [value, setValue] = useState(initial);
  return (
    <DateTimeRangePicker
      label="Date range"
      value={value}
      onChange={(next) => {
        onEmit(next);
        setValue(next);
      }}
    />
  );
}

function setup(initial?: DateTimeRange) {
  const onEmit = vi.fn<(v: DateTimeRange) => void>();
  const user = userEvent.setup();
  render(
    <MantineProvider theme={theme} env="test">
      <Controlled onEmit={onEmit} {...(initial ? { initial } : {})} />
    </MantineProvider>,
  );
  return { onEmit, user, trigger: () => screen.getByRole("button", { name: /Date range/ }) };
}

const lastEmit = (fn: ReturnType<typeof vi.fn<(v: DateTimeRange) => void>>) => fn.mock.calls.at(-1)?.[0];

describe("DateTimeRangePicker", () => {
  it("renders a placeholder when there is no value", () => {
    const { trigger } = setup();
    expect(within(trigger()).getByText("Any date and time")).toBeTruthy();
  });

  it("opens a popover with a range calendar and both time fields", async () => {
    const { user, trigger } = setup();
    await user.click(trigger());

    screen.getByRole("table");
    screen.getByLabelText("From time");
    screen.getByLabelText("To time");
  });

});

describe("DateTimeRangePicker emission", () => {
  it("emits ISO instants for two selected days: start at 00:00 local, end at 23:59 local", async () => {
    const { user, trigger, onEmit } = setup();
    await user.click(trigger());
    await user.click(dayButton(10));
    expect(onEmit).not.toHaveBeenCalled();
    await user.click(dayButton(12));

    expect(lastEmit(onEmit)).toEqual({ from: local(year, month, 10, 0, 0), to: local(year, month, 12, 23, 59) });
  });

  it("treats one day selected twice as that whole day", async () => {
    const { user, trigger, onEmit } = setup();
    await user.click(trigger());
    await user.click(dayButton(10));
    await user.click(dayButton(10));

    expect(lastEmit(onEmit)).toEqual({ from: local(year, month, 10, 0, 0), to: local(year, month, 10, 23, 59) });
  });

  it("updates the emitted instants when the times change", async () => {
    const { user, trigger, onEmit } = setup();
    await user.click(trigger());
    await user.click(dayButton(10));
    await user.click(dayButton(12));
    await user.clear(screen.getByLabelText("From time"));
    await user.type(screen.getByLabelText("From time"), "18:00");
    await user.clear(screen.getByLabelText("To time"));
    await user.type(screen.getByLabelText("To time"), "22:30");

    expect(lastEmit(onEmit)).toEqual({ from: local(year, month, 10, 18, 0), to: local(year, month, 12, 22, 30) });
  });

});

describe("DateTimeRangePicker rules and keyboard", () => {
  it("never emits an inverted range: an earlier end on the same day is clamped and explained", async () => {
    const { user, trigger, onEmit } = setup();
    await user.click(trigger());
    await user.click(dayButton(10));
    await user.click(dayButton(10));
    await user.clear(screen.getByLabelText("From time"));
    await user.type(screen.getByLabelText("From time"), "18:00");
    await user.clear(screen.getByLabelText("To time"));
    await user.type(screen.getByLabelText("To time"), "09:00");

    screen.getByText("End must be after start");
    for (const [value] of onEmit.mock.calls) {
      expect(value.from === null || value.to === null || value.from <= value.to).toBe(true);
    }
    expect(lastEmit(onEmit)).toEqual({ from: local(year, month, 10, 18, 0), to: local(year, month, 10, 18, 0) });
  });

  it("clears both ends and emits nulls", async () => {
    const { user, trigger, onEmit } = setup();
    await user.click(trigger());
    await user.click(dayButton(10));
    await user.click(dayButton(12));
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(lastEmit(onEmit)).toEqual(empty);
  });

  it("is keyboard reachable: Tab to the trigger, Enter opens, Escape closes and returns focus", async () => {
    const { user, trigger } = setup();
    await user.tab();
    expect(document.activeElement).toBe(trigger());
    await user.keyboard("{Enter}");
    screen.getByLabelText("From time");
    await user.keyboard("{Escape}");

    expect(screen.queryByLabelText("From time")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("shows a controlled value as a summary in local time and in the time fields", async () => {
    const { user, trigger } = setup({ from: local(2027, 2, 12, 18, 0), to: local(2027, 2, 14, 22, 0) });
    expect(within(trigger()).getByText("12 Mar 2027 18:00 – 14 Mar 2027 22:00")).toBeTruthy();
    await user.click(trigger());

    expect((screen.getByLabelText("From time") as HTMLInputElement).value).toBe("18:00");
    expect((screen.getByLabelText("To time") as HTMLInputElement).value).toBe("22:00");
  });
});
