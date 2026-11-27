import { DEFAULT_THEME } from "@mantine/core";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../test/contrast";
import { cssVariablesResolver, theme } from "./theme";

describe("base theme", () => {
  it("uses its own ten-shade palette as the primary color, not a Mantine default name", () => {
    expect(theme.primaryColor).toBe("seat");
    expect(theme.colors?.seat).toHaveLength(10);
  });

  it("sets a system font stack without a webfont, the default radius and heading styles", () => {
    expect(theme.fontFamily).toMatch(/system-ui/);
    expect(theme.defaultRadius).toBe("md");
    expect(theme.headings?.fontFamily).toBeDefined();
    expect(theme.headings?.fontWeight).toBeDefined();
  });
});

describe("theme depth", () => {
  it("defines the spacing, font size, line height and heading scales", () => {
    for (const scale of [theme.spacing, theme.fontSizes, theme.lineHeights]) {
      expect(Object.keys(scale ?? {})).toEqual(expect.arrayContaining(["xs", "sm", "md", "lg", "xl"]));
    }
    for (const level of ["h1", "h2", "h3", "h4"] as const) {
      const heading = theme.headings?.sizes?.[level];
      expect(heading?.fontSize).toBeDefined();
      expect(heading?.lineHeight).toBeDefined();
      expect(heading?.fontWeight).toBeDefined();
    }
  });

  it("sets component defaults for the primitives the features use", () => {
    for (const name of ["Button", "Card", "Table", "TextInput", "Modal", "Tabs"]) {
      expect(theme.components?.[name], name).toBeDefined();
    }
  });

  it("shows a keyboard focus ring in a palette color that is visible on the page in both schemes", () => {
    expect(theme.focusRing).toBe("auto");
    const resolved = cssVariablesResolver();
    for (const scheme of ["light", "dark"] as const) {
      const ring = resolveColor(resolved[scheme]["--seat-focus-ring"]);
      expect(contrastRatio(ring, pageBackground[scheme]), scheme).toBeGreaterThanOrEqual(3);
    }
  });
});

const AA_TEXT = 4.5;
const palette = { ...DEFAULT_THEME.colors, ...theme.colors };
const pageBackground = { light: "#ffffff", dark: palette.dark?.[7] ?? "" };

/** Resolves a hex value or a `var(--mantine-color-<name>-<shade>)` reference against the merged palette. */
function resolveColor(value: string | undefined): string {
  const reference = /^var\(--mantine-color-([a-z]+)-(\d)\)$/.exec(value ?? "");
  const color = reference === null ? value : palette[reference[1] ?? ""]?.[Number(reference[2])];
  if (color === undefined || !color.startsWith("#")) {
    throw new Error(`Cannot resolve color ${String(value)}`);
  }
  return color;
}

describe("WCAG AA contrast", () => {
  it("measures black on white as 21 and a mid gray below 4.5", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#868e96", "#ffffff")).toBeLessThan(AA_TEXT);
  });

  it.each(["light", "dark"] as const)("keeps white button text on the primary fill readable in %s", (scheme) => {
    const shade = typeof theme.primaryShade === "object" ? theme.primaryShade[scheme] : 6;
    expect(contrastRatio("#ffffff", palette.seat?.[shade ?? 6] ?? "")).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(["light", "dark"] as const)("keeps body text readable on the page in %s", (scheme) => {
    const text = scheme === "light" ? "#000000" : (palette.dark?.[0] ?? "");
    expect(contrastRatio(text, pageBackground[scheme])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(["light", "dark"] as const)("keeps muted (dimmed) text readable on the page in %s", (scheme) => {
    const dimmed = resolveColor(cssVariablesResolver()[scheme]["--mantine-color-dimmed"]);
    expect(contrastRatio(dimmed, pageBackground[scheme])).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
