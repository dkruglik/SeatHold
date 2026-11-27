import { Anchor, Container, Text, Title } from "../../../shared/ui";
import { Link } from "react-router";

export function NotAllowedPage() {
  return (
    <Container size="sm" py="xl" component="main">
      <Title order={1}>Not allowed</Title>
      <Text mt="md">Your account does not have access to this page.</Text>
      <Anchor component={Link} to="/" mt="md" display="block">
        Back to home
      </Anchor>
    </Container>
  );
}
