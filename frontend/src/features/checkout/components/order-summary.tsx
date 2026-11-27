import { Group, Stack, Text } from "../../../shared/ui";
import { formatPrice } from "../../../shared/lib/format";
import type { OrderSummary as Order } from "../types";

export function OrderSummary({ order }: { readonly order: Order }) {
  return (
    <Stack gap="xs">
      <Text fw={600}>{order.eventTitle}</Text>
      <ul style={{ margin: 0, paddingInlineStart: "1.2rem" }}>
        {order.seats.map((seat) => <li key={seat.id}>{seat.label}</li>)}
      </ul>
      <Text size="sm" c="dimmed">{`${order.seats.length} x ${formatPrice(order.priceMinor, order.currency)}`}</Text>
      <Group justify="space-between">
        <Text fw={700}>Total</Text>
        <Text fw={700}>{formatPrice(order.seats.length * order.priceMinor, order.currency)}</Text>
      </Group>
    </Stack>
  );
}
