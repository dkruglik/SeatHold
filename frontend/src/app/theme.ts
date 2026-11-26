import { createTheme } from "@mantine/core";

/** The single place the design tokens live; features use Mantine props, not ad hoc styles. */
export const theme = createTheme({
  primaryColor: "indigo",
  defaultRadius: "md",
});
