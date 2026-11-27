import { Alert, Anchor, BookingCard, Button, Center, Container, Group, Loader, Stack, Text, Title } from "../../shared/ui";
import { Link } from "react-router";
import { ApiError } from "../../shared/lib/api-client";
import { UserMenu } from "../auth";
import { useMyBookings } from "./hooks/use-my-bookings";

function Body({ query }: { readonly query: ReturnType<typeof useMyBookings> }) {
  if (query.isPending) {
    return (
      <Center p="xl">
        <Loader aria-label="Loading your bookings" />
      </Center>
    );
  }
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 401) {
      return (
        <Stack gap="sm" align="flex-start">
          <Text>Sign in to see your bookings.</Text>
          <Button component={Link} to="/login" state={{ from: "/bookings" }}>
            Sign in
          </Button>
        </Stack>
      );
    }
    return (
      <Alert color="red" role="alert" title="Could not load your bookings">
        <Button variant="default" size="compact-md" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </Alert>
    );
  }
  if (query.data.length === 0) {
    return (
      <Stack gap="xs" align="flex-start">
        <Text fw={600}>No bookings yet</Text>
        <Anchor component={Link} to="/">
          Find a show
        </Anchor>
      </Stack>
    );
  }
  return (
    <Stack gap="lg">
      {query.data.map((booking) => (
        <BookingCard key={booking.bookingId} booking={booking} />
      ))}
    </Stack>
  );
}

/** The signed-in user's bookings with a QR per ticket. */
export function MyBookingsPage() {
  const query = useMyBookings();
  return (
    <>
      <header>
        <Container size="md" py="md">
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Anchor component={Link} to="/" fw={700} c="inherit" underline="never">
              SeatHolder
            </Anchor>
            <UserMenu />
          </Group>
        </Container>
      </header>
      <main>
        <Container size="md" py="xl">
          <Stack gap="lg">
            <Title order={1}>My bookings</Title>
            <Body query={query} />
          </Stack>
        </Container>
      </main>
    </>
  );
}
