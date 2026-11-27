import { Group, Stack, Text } from "@mantine/core";
import { useId, type ReactNode } from "react";

interface FilterBarProps {
  readonly label: string;
  readonly children: ReactNode;
}

/** A visible label above a row of controls; the row wraps on narrow screens. */
export function FilterBar({ label, children }: FilterBarProps) {
  const labelId = useId();
  return (
    <Stack role="group" aria-labelledby={labelId} gap="xs">
      <Text id={labelId} size="sm" fw={600}>
        {label}
      </Text>
      <Group align="flex-end" gap="sm" wrap="wrap">
        {children}
      </Group>
    </Stack>
  );
}
