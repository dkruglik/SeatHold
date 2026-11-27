import { createTheme, type CSSVariablesResolver, type MantineColorsTuple } from "@mantine/core";
import { componentDefaults } from "./theme-components";

/** Brand palette, lightest to darkest; shade 6 is the primary in light mode. */
const seat: MantineColorsTuple = [
  "#eef3ff",
  "#dce4f5",
  "#b9c7e2",
  "#94a8d0",
  "#748dc1",
  "#5f7cb8",
  "#5474b4",
  "#44639f",
  "#39588f",
  "#2c4b80",
];

const systemFont =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';

/** The single place the design tokens live; features use Mantine props, not ad hoc styles. */
export const theme = createTheme({
  colors: { seat },
  primaryColor: "seat",
  // White text on shade 6 is 4.63:1 (light) and on shade 8 is 7.08:1 (dark): both pass WCAG AA.
  primaryShade: { light: 6, dark: 8 },
  fontFamily: systemFont,
  defaultRadius: "md",
  spacing: { xs: "0.5rem", sm: "0.75rem", md: "1rem", lg: "1.5rem", xl: "2rem" },
  fontSizes: { xs: "0.75rem", sm: "0.875rem", md: "1rem", lg: "1.125rem", xl: "1.25rem" },
  lineHeights: { xs: "1.4", sm: "1.45", md: "1.5", lg: "1.55", xl: "1.6" },
  headings: {
    fontFamily: systemFont,
    fontWeight: "650",
    sizes: {
      h1: { fontSize: "2rem", lineHeight: "1.25", fontWeight: "700" },
      h2: { fontSize: "1.5rem", lineHeight: "1.3", fontWeight: "650" },
      h3: { fontSize: "1.25rem", lineHeight: "1.35", fontWeight: "650" },
      h4: { fontSize: "1.125rem", lineHeight: "1.4", fontWeight: "600" },
      h5: { fontSize: "1rem", lineHeight: "1.45", fontWeight: "600" },
      h6: { fontSize: "0.875rem", lineHeight: "1.5", fontWeight: "600" },
    },
  },
  // Mantine draws the focus outline (2px, palette colour) for keyboard users only.
  focusRing: "auto",
  components: componentDefaults,
});

/**
 * Colour-scheme variables: muted text and the focus ring use palette shades that keep at least
 * 4.5:1 (text) and 3:1 (ring) against the page in both schemes; Mantine's gray-6 dimmed text does not.
 */
export const cssVariablesResolver = (): ReturnType<CSSVariablesResolver> => ({
  variables: {},
  light: {
    "--mantine-color-dimmed": "var(--mantine-color-gray-7)",
    "--seat-focus-ring": "var(--mantine-color-seat-6)",
  },
  dark: {
    "--mantine-color-dimmed": "var(--mantine-color-dark-1)",
    "--seat-focus-ring": "var(--mantine-color-seat-4)",
  },
});
