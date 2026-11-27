import { Group, Text } from "@mantine/core";
import { SeatMarker, stateLook } from "./seat-marker";
import { markerSize } from "./seat-tokens";
import type { SeatState } from "./types";

const legendStates: readonly { readonly state: SeatState; readonly text: string }[] = [
  { state: "available", text: "Available" },
  { state: "held", text: "Held by someone else" },
  { state: "sold", text: "Sold" },
  { state: "held_by_me", text: "Selected by you" },
];

/** Names each marker, so no state is told by color alone. */
export function SeatLegend() {
  return (
    <Group component="ul" gap="md" aria-label="Seat legend" m={0} p={0} style={{ listStyle: "none" }}>
      {legendStates.map(({ state, text }) => (
        <Group component="li" key={state} gap={6} wrap="nowrap" data-marker={stateLook[state].marker}>
          <svg width={markerSize} height={markerSize} viewBox={`0 0 ${markerSize} ${markerSize}`} aria-hidden="true" focusable="false">
            <SeatMarker state={state} />
          </svg>
          <Text size="sm">{text}</Text>
        </Group>
      ))}
    </Group>
  );
}
