import { Container, Group, Stack, Title } from "@mantine/core";
import type { ReactNode } from "react";

interface PageLayoutProps {
  readonly title: string;
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  /** Container width; the default suits lists and tables, `xs` or `sm` a form. */
  readonly size?: "xs" | "sm" | "md" | "lg";
}

/** A page: the h1 title with optional actions beside it, then the content, in one max-width container. */
export function PageLayout({ title, actions, children, size = "lg" }: PageLayoutProps) {
  return (
    <Container size={size} py="lg">
      <Stack gap="lg">
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Title order={1} style={{ overflowWrap: "anywhere", minWidth: 0 }}>
            {title}
          </Title>
          {actions === undefined ? null : <Group gap="sm">{actions}</Group>}
        </Group>
        {children}
      </Stack>
    </Container>
  );
}
