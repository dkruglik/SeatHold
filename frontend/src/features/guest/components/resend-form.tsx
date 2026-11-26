import { Alert, Button, Stack, Text, TextInput } from "@mantine/core";
import { useState, type FormEvent } from "react";
import type { GuestApi, ResendResult } from "../services/guest-api";

type Outcome = ResendResult | "error" | null;

const messages: Record<Exclude<Outcome, null | "invalid">, string> = {
  sent: "If we found upcoming bookings for this address, we sent new links.",
  rate_limited: "Too many requests, try again later",
  error: "Something went wrong. Please try again.",
};

/** The lost-link form. A successful answer is the same for every address, so it tells nothing about who has bookings. */
export function ResendForm({ api }: { readonly api: GuestApi }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setOutcome(null);
    try {
      setOutcome(await api.resend(email.trim()));
    } catch {
      setOutcome("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <Stack gap="sm">
        <Text size="sm">Lost your link? Enter the email you booked with and we will send new ones.</Text>
        <TextInput
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          withAsterisk={false}
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
          error={outcome === "invalid" ? "Enter a valid email address" : undefined}
        />
        <Button type="submit" loading={busy} disabled={busy} style={{ alignSelf: "flex-start" }}>
          Send new links
        </Button>
        {outcome === "sent" ? (
          <Alert color="teal" role="status">
            {messages.sent}
          </Alert>
        ) : null}
        {outcome === "rate_limited" || outcome === "error" ? (
          <Alert color="red" role="alert">
            {messages[outcome]}
          </Alert>
        ) : null}
      </Stack>
    </form>
  );
}
