import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { theme } from "../../../app/theme";
import { PageLayout } from "./page-layout";

describe("PageLayout", () => {
  it("renders the title as the h1, the actions next to it and the content", () => {
    render(
      <MantineProvider theme={theme} env="test">
        <PageLayout title="Shows" actions={<button type="button">New show</button>}>
          <p>Body</p>
        </PageLayout>
      </MantineProvider>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Shows" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "New show" })).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("renders without actions", () => {
    render(
      <MantineProvider theme={theme} env="test">
        <PageLayout title="Tickets">content</PageLayout>
      </MantineProvider>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Tickets" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
