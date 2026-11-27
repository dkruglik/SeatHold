import { useState } from "react";
import { formatPrice } from "../../lib/format";
import { stateLook } from "./seat-marker";
import { markerSize } from "./seat-tokens";
import type { SeatMapSeat } from "./types";

/** "Row C, seat 7 · €45.00 · available"; the price part is left out when the map has no price. */
export function seatTooltipText(seat: SeatMapSeat, priceMinor?: number, currency?: string): string {
  const price = priceMinor !== undefined && currency !== undefined ? [formatPrice(priceMinor, currency)] : [];
  return [`Row ${seat.row}, seat ${seat.number}`, ...price, stateLook[seat.state].label].join(" · ");
}

/** Which seat shows the tooltip: hover wins over focus; Escape hides it until the next hover or focus. */
export function useSeatTooltip() {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  return {
    activeId: dismissed ? null : (hoverId ?? focusId),
    onHover(id: string | null) {
      setHoverId(id);
      setDismissed(false);
    },
    onFocus(id: string) {
      setFocusId(id);
      setDismissed(false);
    },
    onBlur() {
      setFocusId(null);
    },
    dismiss() {
      setDismissed(true);
    },
  };
}

export const tooltipId = "seat-map-tooltip";
const charWidth = 6.6;

interface SeatTooltipProps {
  readonly text: string;
  /** Top-left of the seat in map units. */
  readonly x: number;
  readonly y: number;
  readonly mapWidth: number;
}

/** The tooltip drawn in the map's own coordinates, above the seat (below it in the first row), kept inside the map. */
export function SeatTooltip({ text, x, y, mapWidth }: SeatTooltipProps) {
  const width = text.length * charWidth + 16;
  const centerX = Math.min(Math.max(x + markerSize / 2, width / 2), mapWidth - width / 2);
  const top = y >= 30 ? y - 30 : y + markerSize + 6;
  return (
    <g id={tooltipId} role="tooltip" transform={`translate(${centerX} ${top})`} style={{ pointerEvents: "none" }}>
      <rect x={-width / 2} y={0} width={width} height={24} rx={5} fill="var(--mantine-color-text)" />
      <text x={0} y={12} textAnchor="middle" dominantBaseline="central" fontSize={12} fill="var(--mantine-color-body)">
        {text}
      </text>
    </g>
  );
}
