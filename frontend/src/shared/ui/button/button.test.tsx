import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { theme } from "../../../app/theme";
import { Button } from "./button";

function renderButton(props: { loading?: boolean; disabled?: boolean } = {}) {
  render(
    <MantineProvider theme={theme} env="test">
      <Button {...props}>Pay</Button>
    </MantineProvider>,
  );
  return screen.getByRole("button", { name: "Pay" }) as HTMLButtonElement;
}

describe("Button", () => {
  it("is enabled and not busy by default", () => {
    const button = renderButton();

    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-busy")).toBeNull();
  });

  it("while loading is disabled and busy but keeps its label as the accessible name", () => {
    const button = renderButton({ loading: true });

    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  it("is disabled when told so without being busy", () => {
    const button = renderButton({ disabled: true });

    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBeNull();
  });

  it("renders as another element through the component prop", () => {
    render(
      <MantineProvider theme={theme} env="test">
        <Button component="a" href="/x">
          Go
        </Button>
      </MantineProvider>,
    );

    expect(screen.getByRole("link", { name: "Go" }).getAttribute("href")).toBe("/x");
  });
});
