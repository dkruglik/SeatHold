import { MantineProvider } from "@mantine/core";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { theme } from "../../../app/theme";
import { FilterBar } from "./filter-bar";

describe("FilterBar", () => {
  it("shows its label and groups the controls under it", () => {
    render(
      <MantineProvider theme={theme} env="test">
        <FilterBar label="Filter shows">
          <input aria-label="City" />
          <input aria-label="Genre" />
        </FilterBar>
      </MantineProvider>,
    );

    const bar = screen.getByRole("group", { name: "Filter shows" });
    expect(screen.getByText("Filter shows")).toBeTruthy();
    expect(within(bar).getByRole("textbox", { name: "City" })).toBeTruthy();
    expect(within(bar).getByRole("textbox", { name: "Genre" })).toBeTruthy();
  });
});
