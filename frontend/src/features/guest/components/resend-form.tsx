import { Alert, Button, Stack, Text, TextInput } from "@mantine/core";
import { useState, type FormEvent } from "react";
import { formatRetry } from "../../../shared/lib/format";
import type { GuestApi, ResendResult } from "../services/guest-api";

type Outcome = ResendResult | { readonly kind: "error" } | null;

const sentMessage = "If we found upcoming bookings for this address, we sent new links.";

function failureMessage(outcome: Outcome): string | null {
  if (outcome?.kind === "error") {
    return "Something went wrong. Please try again.";
  }
  if (outcome?.kind !== "rate_limited") {
    return null;
  }
  return outcome.retryAfterSeconds === undefined
    ? "Too many requests, try again later"
    : `Too many requests. Try again in ${formatRetry(outcome.retryAfterSeconds)}.`;
}

function Notices({ outcome }: { readonly outcome: Outcome }) {
  const failure = failureMessage(outcome);
  if (outcome?.kind === "sent") {
    return (
      <Alert color="teal" role="status">
        {sentMessage}
      </Alert>
    );
  }
  return failure === null ? null : (
    <Alert color="red" role="alert">
      {failure}
    </Alert>
  );
}

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
      setOutcome({ kind: "error" });
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
          error={outcome?.kind === "invalid" ? "Enter a valid email address" : undefined}
        />
        <Button type="submit" loading={busy} disabled={busy} style={{ alignSelf: "flex-start" }}>
          Send new links
        </Button>
        <Notices outcome={outcome} />
      </Stack>
    </form>
  );
}
