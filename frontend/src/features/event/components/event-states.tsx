import { Alert, Anchor, Button, Skeleton, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router";

export function EventLoading() {
  return (
    <Stack gap="md" role="status" aria-label="Loading event" aria-busy="true">
      <Skeleton height={36} width="50%" />
      <Skeleton height={20} width="30%" />
      <Skeleton height={260} />
    </Stack>
  );
}

export function EventNotFound() {
  return (
    <Stack gap="sm">
      <Title order={1}>Event not found</Title>
      <Text>This event does not exist or is no longer on sale.</Text>
      <Anchor component={Link} to="/">Back to all shows</Anchor>
    </Stack>
  );
}

export function EventLoadError({ message, onRetry }: { readonly message: string; readonly onRetry: () => void }) {
  return (
    <Alert color="red" title="Something went wrong">
      <Stack gap="xs" align="flex-start">
        <Text>{message}</Text>
        <Button variant="light" onClick={onRetry}>Retry</Button>
      </Stack>
    </Alert>
  );
}
