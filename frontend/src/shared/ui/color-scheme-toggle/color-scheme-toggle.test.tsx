import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { theme } from "../../../app/theme";
import { ColorSchemeToggle } from "./color-scheme-toggle";

const storageKey = "mantine-color-scheme-value";
const schemeOnDocument = () => document.documentElement.getAttribute("data-mantine-color-scheme");

function renderToggle() {
  return render(
    <MantineProvider theme={theme} defaultColorScheme="auto" env="test">
      <ColorSchemeToggle />
    </MantineProvider>,
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(() => document.documentElement.removeAttribute("data-mantine-color-scheme"));

describe("ColorSchemeToggle", () => {
  it("offers light, dark and auto, with auto selected by default", () => {
    renderToggle();

    expect(screen.getByRole("radiogroup", { name: "Color scheme" })).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Auto" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("radio", { name: "Light" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Dark" })).toBeTruthy();
  });

  it("switches the document to dark and stores only the preference string", async () => {
    renderToggle();

    await userEvent.setup().click(screen.getByRole("radio", { name: "Dark" }));

    expect(schemeOnDocument()).toBe("dark");
    expect(window.localStorage.getItem(storageKey)).toBe("dark");
    expect(window.localStorage.length).toBe(1);
  });

  it("restores the stored choice on the next mount", () => {
    window.localStorage.setItem(storageKey, "dark");

    renderToggle();

    expect(schemeOnDocument()).toBe("dark");
    expect((screen.getByRole("radio", { name: "Dark" }) as HTMLInputElement).checked).toBe(true);
  });

  it("switches back to light and to auto", async () => {
    window.localStorage.setItem(storageKey, "dark");
    renderToggle();
    const user = userEvent.setup();

    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(schemeOnDocument()).toBe("light");
    expect(window.localStorage.getItem(storageKey)).toBe("light");

    await user.click(screen.getByRole("radio", { name: "Auto" }));
    expect(window.localStorage.getItem(storageKey)).toBe("auto");
    cleanup();
  });
});
