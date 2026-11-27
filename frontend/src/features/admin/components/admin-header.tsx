import { Container, Group, Text } from "../../../shared/ui";
import type { ReactNode } from "react";
import { UserMenu } from "../../auth";

/** The chrome of every admin screen: brand, account menu, then the page. */
export function AdminLayout({ children }: { readonly children: ReactNode }) {
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
      <Container size="lg" py="xl" component="main">
        {children}
      </Container>
    </>
  );
}
