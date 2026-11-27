import { Container, Group, PageLayout, Text } from "../../../shared/ui";
import type { ReactNode } from "react";
import { UserMenu } from "../../auth";

interface AdminLayoutProps {
  /** The page's h1. */
  readonly title: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

/** The chrome of every admin screen: brand, account menu, then the titled page. */
export function AdminLayout({ title, actions, children }: AdminLayoutProps) {
  return (
    <>
      <header>
        <Container size="lg" py="md">
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Text fw={700}>SeatHolder back office</Text>
            <UserMenu />
          </Group>
        </Container>
      </header>
      <main>
        <PageLayout title={title} actions={actions}>
          {children}
        </PageLayout>
      </main>
    </>
  );
}
