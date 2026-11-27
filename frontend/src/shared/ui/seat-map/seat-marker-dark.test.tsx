import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { theme } from "../../../app/theme";
import { SeatLegend } from "./seat-legend";

const allowedPaint = /^(none|currentColor|var\(--mantine-[a-z0-9-]+\))$/;

describe("seat markers in the dark scheme", () => {
  it("paint every fill and stroke from theme variables, never a hard-coded color", () => {
    const { container } = render(
      <MantineProvider theme={theme} forceColorScheme="dark" env="test">
        <SeatLegend />
      </MantineProvider>,
    );

    expect(document.documentElement.getAttribute("data-mantine-color-scheme")).toBe("dark");
    expect(screen.getByRole("list", { name: "Seat legend" })).toBeTruthy();
    const painted = [...container.querySelectorAll("svg *")].flatMap((el) =>
      ["fill", "stroke"].flatMap((attribute) => {
        const value = el.getAttribute(attribute);
        return value === null ? [] : [{ attribute, value }];
      }),
    );
    expect(painted.length).toBeGreaterThan(0);
    expect(painted.filter(({ value }) => !allowedPaint.test(value))).toEqual([]);
  });
});
