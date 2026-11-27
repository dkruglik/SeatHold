import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { theme } from "../../../app/theme";
import { DateTimeRangePicker, type DateTimeRange, type DateTimeRangePickerProps } from "./index";

const empty: DateTimeRange = { from: null, to: null };
/** Wednesday 10 June 2026, 15:30:45 UTC: 17:30 in Berlin, 11:30 in New York. */
const WED = new Date("2026-06-10T15:30:45Z");

type Extra = Partial<Pick<DateTimeRangePickerProps, "timeZone" | "allowPast" | "now">>;

function Controlled({ onEmit, initial, extra }: { onEmit: (v: DateTimeRange) => void; initial: DateTimeRange; extra: Extra }) {
  const [value, setValue] = useState(initial);
  return (
    <DateTimeRangePicker
      label="Date range"
      value={value}
      onChange={(next) => {
        onEmit(next);
        setValue(next);
      }}
      {...extra}
    />
  );
}

async function open(extra: Extra = {}, initial: DateTimeRange = empty) {
  const onEmit = vi.fn<(v: DateTimeRange) => void>();
  const user = userEvent.setup();
  render(
    <MantineProvider theme={theme} env="test">
      <Controlled onEmit={onEmit} initial={initial} extra={{ now: () => WED, ...extra }} />
    </MantineProvider>,
  );
  const trigger = screen.getByRole("button", { name: /Date range/ });
  await user.click(trigger);
  return { onEmit, user, trigger };
}

const last = (fn: ReturnType<typeof vi.fn<(v: DateTimeRange) => void>>) => fn.mock.calls.at(-1)?.[0];
const preset = (name: string) => screen.getByRole("button", { name });

describe("presets in Europe/Berlin", () => {
  const timeZone = "Europe/Berlin";

  it("Tonight runs from now to the end of today", async () => {
    const { user, onEmit } = await open({ timeZone });
    await user.click(preset("Tonight"));
    expect(last(onEmit)).toEqual({ from: "2026-06-10T15:30:00.000Z", to: "2026-06-10T21:59:00.000Z" });
  });

  it("This weekend runs from Saturday 00:00 to the end of Sunday", async () => {
    const { user, onEmit } = await open({ timeZone });
    await user.click(preset("This weekend"));
    expect(last(onEmit)).toEqual({ from: "2026-06-12T22:00:00.000Z", to: "2026-06-14T21:59:00.000Z" });
  });

  it("This weekend starts from now when it is already the weekend there", async () => {
    // 23:00 UTC on Saturday is already Sunday 01:00 in Berlin.
    const now = () => new Date("2026-06-13T23:00:00Z");
    const { user, onEmit } = await open({ timeZone, now });
    await user.click(preset("This weekend"));
    expect(last(onEmit)).toEqual({ from: "2026-06-13T23:00:00.000Z", to: "2026-06-14T21:59:00.000Z" });
  });

  it("Next 7 days and Next 30 days start now", async () => {
    const { user, onEmit } = await open({ timeZone });
    await user.click(preset("Next 7 days"));
    expect(last(onEmit)).toEqual({ from: "2026-06-10T15:30:00.000Z", to: "2026-06-17T15:30:00.000Z" });
    await user.click(preset("Next 30 days"));
    expect(last(onEmit)).toEqual({ from: "2026-06-10T15:30:00.000Z", to: "2026-07-10T15:30:00.000Z" });
  });
});

describe("presets in America/New_York", () => {
  const timeZone = "America/New_York";

  it("Tonight ends at 23:59 New York time", async () => {
    const { user, onEmit } = await open({ timeZone });
    await user.click(preset("Tonight"));
    expect(last(onEmit)).toEqual({ from: "2026-06-10T15:30:00.000Z", to: "2026-06-11T03:59:00.000Z" });
  });

  it("This weekend starts at Saturday 00:00 New York time", async () => {
    const { user, onEmit } = await open({ timeZone });
    await user.click(preset("This weekend"));
    expect(last(onEmit)).toEqual({ from: "2026-06-13T04:00:00.000Z", to: "2026-06-15T03:59:00.000Z" });
  });

  it("still counts Saturday evening as the weekend while Berlin is already on Sunday", async () => {
    const now = () => new Date("2026-06-13T23:00:00Z");
    const { user, onEmit } = await open({ timeZone, now });
    await user.click(preset("This weekend"));
    expect(last(onEmit)).toEqual({ from: "2026-06-13T23:00:00.000Z", to: "2026-06-15T03:59:00.000Z" });
  });
});

describe("preset state", () => {
  it("marks only the preset that equals the current range as pressed", async () => {
    const { user } = await open({ timeZone: "Europe/Berlin" });
    expect(preset("Tonight").getAttribute("aria-pressed")).toBe("false");
    await user.click(preset("Next 7 days"));
    expect(preset("Next 7 days").getAttribute("aria-pressed")).toBe("true");
    expect(preset("Tonight").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("timezone label", () => {
  it("names the zone and reads the time fields in it", async () => {
    const { user, onEmit } = await open(
      { timeZone: "America/New_York" },
      { from: "2026-06-12T22:00:00.000Z", to: "2026-06-13T22:00:00.000Z" },
    );
    screen.getByText("Times in America/New_York");
    expect((screen.getByLabelText("From time") as HTMLInputElement).value).toBe("18:00");
    await user.clear(screen.getByLabelText("From time"));
    await user.type(screen.getByLabelText("From time"), "19:00");
    expect(last(onEmit)?.from).toBe("2026-06-12T23:00:00.000Z");
  });

  it("defaults to the browser zone", async () => {
    await open();
    screen.getByText(`Times in ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  });
});

describe("inline validation", () => {
  const berlin = { timeZone: "Europe/Berlin" };

  it("rejects a range that is already over, then accepts a fixed one", async () => {
    const { user, onEmit } = await open(berlin, { from: "2026-06-01T10:00:00.000Z", to: "2026-06-02T10:00:00.000Z" });
    expect(screen.getByRole("alert").textContent).toBe("This range is already over");
    expect(screen.getByLabelText("To time").getAttribute("aria-invalid")).toBe("true");
    expect(onEmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Next 7 days" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("To time").getAttribute("aria-invalid")).not.toBe("true");
    expect(onEmit).toHaveBeenCalledTimes(1);
  });

  it("does not apply a past range typed into the time fields", async () => {
    const { user, onEmit } = await open(berlin, { from: "2026-06-10T10:00:00.000Z", to: "2026-06-10T21:00:00.000Z" });
    await user.clear(screen.getByLabelText("To time"));
    await user.type(screen.getByLabelText("To time"), "17:00");
    screen.getByText("This range is already over");
    expect(onEmit).not.toHaveBeenCalled();
  });

  it("allows past ranges with allowPast", async () => {
    const { onEmit } = await open({ ...berlin, allowPast: true }, { from: "2026-06-01T10:00:00.000Z", to: "2026-06-02T10:00:00.000Z" });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onEmit).not.toHaveBeenCalled();
  });

  it("explains an end before the start and does not apply it", async () => {
    const { user, onEmit } = await open(berlin, { from: "2026-06-12T10:00:00.000Z", to: "2026-06-11T10:00:00.000Z" });
    expect(screen.getByRole("alert").textContent).toBe("End must be after start");
    expect(onEmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Next 30 days" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("keyboard", () => {
  it("Tab moves calendar, from time, to time, presets, Clear", async () => {
    const { user } = await open({ timeZone: "Europe/Berlin" });
    const day = screen.getAllByRole("button").find((b) => b.getAttribute("tabindex") === "0" && b.closest("table"));
    day?.focus();
    const names: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      await user.tab();
      const el = document.activeElement as HTMLElement;
      names.push((el as HTMLInputElement).labels?.[0]?.textContent ?? el.textContent ?? "");
    }
    expect(names.slice(0, 7)).toEqual(["From time", "To time", "Tonight", "This weekend", "Next 7 days", "Next 30 days", "Clear"]);
  });

  it("arrow keys move the focused day", async () => {
    const { user } = await open({ timeZone: "Europe/Berlin" });
    const day = screen.getAllByRole("button").find((b) => b.getAttribute("tabindex") === "0" && b.closest("table")) as HTMLElement;
    day.focus();
    const label = (el: Element) => dayjs(el.getAttribute("aria-label") ?? "", "D MMMM YYYY");
    const before = label(day);
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).not.toBe(day);
    expect(label(document.activeElement as HTMLElement).diff(before, "day")).toBe(1);
    await user.keyboard("{ArrowDown}");
    expect(label(document.activeElement as HTMLElement).diff(before, "day")).toBe(8);
  });

  it("Escape closes the popover from a field and returns focus to the trigger", async () => {
    const { user, trigger } = await open();
    screen.getByLabelText("From time").focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("From time")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
