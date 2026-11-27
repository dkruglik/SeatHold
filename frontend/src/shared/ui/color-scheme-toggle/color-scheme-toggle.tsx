import { SegmentedControl, useMantineColorScheme, type MantineColorScheme } from "@mantine/core";

const options: readonly { readonly value: MantineColorScheme; readonly label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "auto", label: "Auto" },
];

/** Light, dark or follow the system. Mantine's manager keeps only the preference string in localStorage. */
export function ColorSchemeToggle() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return (
    <SegmentedControl
      size="xs"
      aria-label="Color scheme"
      data={[...options]}
      value={colorScheme}
      onChange={(value) => setColorScheme(value as MantineColorScheme)}
    />
  );
}
