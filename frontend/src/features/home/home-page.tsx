import { Container, Group, Text, Title } from "@mantine/core";
import { UserMenu } from "../auth";

export function HomePage() {
  return (
    <>
      <header>
        <Container size="md" py="md">
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Text fw={700}>SeatHolder</Text>
            <UserMenu />
          </Group>
        </Container>
      </header>
      <main>
        <Container size="md" py="xl">
          <Title order={1}>SeatHolder</Title>
          <Text mt="md">Event seat reservations are on the way. This page is a placeholder.</Text>
        </Container>
      </main>
    </>
  );
}
