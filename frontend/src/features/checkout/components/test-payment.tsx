import { Button, Stack, Text } from "@mantine/core";
import type { MockPaymentOutcome } from "../types";

interface TestPaymentProps {
  readonly disabled: boolean;
  readonly busy: boolean;
  readonly onPay: (outcome: MockPaymentOutcome) => void;
}

/** A mock: the buyer picks the outcome the mock gateway returns. No card is taken and no money moves. */
export function TestPayment({ disabled, busy, onPay }: TestPaymentProps) {
  return (
    <Stack component="fieldset" gap="xs" m={0} p={0} style={{ border: 0, minWidth: 0 }}>
      <legend style={{ padding: 0, fontWeight: 600 }}>Test payment</legend>
      <Text size="sm" c="dimmed">No real money is charged. Pick the outcome you want to try.</Text>
      <Button type="button" disabled={disabled} aria-busy={busy} onClick={() => onPay("succeed")}>Pay (succeed)</Button>
      <Button type="button" variant="default" disabled={disabled} aria-busy={busy} onClick={() => onPay("fail")}>Pay (fail)</Button>
    </Stack>
  );
}
