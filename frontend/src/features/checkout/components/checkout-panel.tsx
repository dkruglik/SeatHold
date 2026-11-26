import { Alert, Button, Paper, Stack, TextInput, Title } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { useMe } from "../../auth";
import { useCheckout } from "../hooks/use-checkout";
import { isPlausibleEmail } from "../lib/email";
import type { CheckoutSettled, MockPaymentOutcome, OrderSummary as Order } from "../types";
import { Confirmation } from "./confirmation";
import { OrderSummary } from "./order-summary";
import { TestPayment } from "./test-payment";

export interface CheckoutPanelProps {
  readonly order: Order;
  /** False once the hold is gone (countdown at zero): payment is disabled. */
  readonly holdLive: boolean;
  readonly onSettled: (outcome: CheckoutSettled) => void;
  readonly onClose: () => void;
}

const emailError = "Enter a valid email address.";

export function CheckoutPanel({ order, holdLive, onSettled, onClose }: CheckoutPanelProps) {
  const me = useMe();
  const guest = me.isError || me.data === null;
  const { state, submit } = useCheckout(order.eventId, onSettled);
  const [email, setEmail] = useState("");
  const [invalid, setInvalid] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const alert = useRef<HTMLDivElement>(null);
  const failure = state.status === "failed" ? state.failure : null;
  useEffect(() => alert.current?.focus(), [state]);

  const pay = (outcome: MockPaymentOutcome) => {
    const address = email.trim();
    if (guest && !isPlausibleEmail(address)) {
      setInvalid(true);
      emailInput.current?.focus();
      return;
    }
    setInvalid(false);
    void submit(outcome, guest ? address : null);
  };

  return (
    <Paper component="section" aria-label="Checkout" aria-busy={state.status === "submitting"} withBorder p="md">
      {state.status === "confirmed" ? (
        <Confirmation booking={state.booking} seats={order.seats} guestEmail={state.email} onClose={onClose} />
      ) : (
        <Stack gap="sm">
          <Title order={2} size="h4">Checkout</Title>
          <OrderSummary order={order} />
          {guest && !me.isPending ? (
            <TextInput
              ref={emailInput} type="email" label="Email" description="We email your ticket link here" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.currentTarget.value)} error={invalid} maxLength={254}
            />
          ) : null}
          {invalid ? <Alert role="alert" color="red">{emailError}</Alert> : null}
          {failure !== null ? <Alert role="alert" color="red" tabIndex={-1} ref={alert}>{failure.message}</Alert> : null}
          <TestPayment disabled={!holdLive || failure?.kind === "expired" || me.isPending || state.status === "submitting"} busy={state.status === "submitting"} onPay={pay} />
          {failure?.kind === "expired" || !holdLive ? <Button variant="default" onClick={onClose}>Back to seats</Button> : null}
        </Stack>
      )}
    </Paper>
  );
}
