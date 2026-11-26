import { Container, Text, Title } from "@mantine/core";

export function HomePage() {
  return (
    <>
      <header>
        <Container size="md" py="md">
          <Text fw={700}>SeatHolder</Text>
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
