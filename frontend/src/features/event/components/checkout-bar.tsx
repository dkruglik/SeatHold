import { Button, Group, Paper, Text } from "../../../shared/ui";
import { formatRemaining } from "../hooks/use-countdown";

interface CheckoutBarProps {
  readonly remainingSeconds: number | null;
  /** True once the checkout panel is open: the bar then scrolls to it instead of opening it. */
  readonly checkingOut: boolean;
  readonly onContinue: () => void;
}

/** The phone layout's docked bar: the hold countdown and the way on to payment stay in reach while the buyer scrolls the map. */
export function CheckoutBar({ remainingSeconds, checkingOut, onContinue }: CheckoutBarProps) {
  return (
    <Paper
      component="section"
      aria-label="Hold and payment"
      data-testid="checkout-bar"
      withBorder
      shadow="md"
      p="sm"
      style={{ position: "sticky", bottom: 0, zIndex: 20, paddingBottom: "max(var(--mantine-spacing-sm), env(safe-area-inset-bottom))" }}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm">
        {remainingSeconds === null ? null : <Text role="timer" aria-live="off" fw={600}>{`Time left to pay: ${formatRemaining(remainingSeconds)}`}</Text>}
        <Button onClick={onContinue}>{checkingOut ? "Go to payment" : "Continue to payment"}</Button>
      </Group>
    </Paper>
  );
}
