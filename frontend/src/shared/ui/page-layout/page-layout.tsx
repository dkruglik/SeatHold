import { Container, Group, Stack, Title } from "@mantine/core";
import type { ReactNode } from "react";

interface PageLayoutProps {
  readonly title: string;
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
}

/** A page: the h1 title with optional actions beside it, then the content, in one max-width container. */
export function PageLayout({ title, actions, children }: PageLayoutProps) {
  return (
    <Container size="lg" py="lg">
      <Stack gap="lg">
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Title order={1}>{title}</Title>
          {actions === undefined ? null : <Group gap="sm">{actions}</Group>}
        </Group>
        {children}
      </Stack>
    </Container>
  );
}
