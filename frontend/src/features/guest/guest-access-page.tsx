import { Anchor, BookingCard, Center, Container, Loader, PageLayout, Stack } from "../../shared/ui";
import { Link } from "react-router";
import { ClosedNotice } from "./components/closed-notice";
import { ResendForm } from "./components/resend-form";
import { useGuestAccess } from "./hooks/use-guest-access";
import { useGuestApi } from "./hooks/use-guest-api";

/** `/guest/access#t=<token>`: opens the emailed link once and shows the tickets, or explains why it cannot and offers new links. */
export function GuestAccessPage() {
  const api = useGuestApi();
  const state = useGuestAccess(api);

  return (
    <>
      <header>
        <Container size="md" py="md">
          <Anchor component={Link} to="/" fw={700} c="inherit" underline="never">
            SeatHolder
          </Anchor>
        </Container>
      </header>
      <main>
        <PageLayout title="Your tickets" size="md">
          <Stack gap="lg">
            {state.kind === "loading" ? (
              <Center p="xl">
                <Loader aria-label="Opening your tickets" />
              </Center>
            ) : null}
            {state.kind === "booking" ? <BookingCard booking={state.booking} /> : null}
            {state.kind === "closed" ? (
              <>
                <ClosedNotice reason={state.reason} />
                <ResendForm api={api} />
              </>
            ) : null}
          </Stack>
        </PageLayout>
      </main>
    </>
  );
}
