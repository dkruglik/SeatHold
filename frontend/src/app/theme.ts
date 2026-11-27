import { createTheme, type MantineColorsTuple } from "@mantine/core";

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
  fontFamily: systemFont,
  defaultRadius: "md",
  headings: { fontFamily: systemFont, fontWeight: "650" },
});
