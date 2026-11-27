import { Stack } from "@mantine/core";
import { useRef, type KeyboardEvent } from "react";
import { groupByRow, labelWidth, pitch, rowY, seatX } from "./seat-layout";
import { SeatLegend } from "./seat-legend";
import { SeatRows } from "./seat-rows";
import { SeatTooltip, seatTooltipText, tooltipId, useSeatTooltip } from "./seat-tooltip";
import type { SeatMapProps } from "./types";
import { useSeatKeyboard } from "./use-seat-keyboard";
import { ZoomPan } from "./zoom-pan";

/**
 * A grid of seats drawn as SVG. Presentational only: the caller owns the seat states and decides what a selection does.
 * Each seat is named "Row C, seat 7, available"; the four states differ in shape (outline, dashed, cross, check), not just color.
 * One seat is the tab stop; arrows, Home, End, PageUp and PageDown move focus. Seat ids key the buttons, so a refresh keeps focus.
 */
export function SeatMap({ rows, seatsPerRow, seats, onSelect, disabled = false, priceMinor, currency }: SeatMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const byRow = groupByRow(seats);
  const keyboard = useSeatKeyboard(byRow, svgRef);
  const tooltip = useSeatTooltip();
  const width = labelWidth * 2 + seatsPerRow * pitch;
  const height = Math.max(rows, byRow.length) * pitch;
  const tipRow = byRow.findIndex(([, rowSeats]) => rowSeats.some((s) => s.id === tooltip.activeId));
  const tipSeat = byRow[tipRow]?.[1].find((s) => s.id === tooltip.activeId);

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "Escape") {
      tooltip.dismiss();
    }
    keyboard.onKeyDown(event);
  }

  return (
    <Stack gap="sm">
      <ZoomPan>
        <svg ref={svgRef} role="group" aria-label="Seat map" viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", maxWidth: width * 1.5, height: "auto", display: "block" }} onKeyDown={onKeyDown}>
          <SeatRows
            rows={byRow}
            seatsPerRow={seatsPerRow}
            disabled={disabled}
            onSelect={onSelect}
            tabId={keyboard.tabId}
            tooltipFor={(id) => (id === tooltip.activeId ? tooltipId : undefined)}
            onFocusSeat={(id) => {
              keyboard.onSeatFocus(id);
              tooltip.onFocus(id);
            }}
            onBlurSeat={tooltip.onBlur}
            onHoverSeat={tooltip.onHover}
          />
          {tipSeat === undefined ? null : <SeatTooltip text={seatTooltipText(tipSeat, priceMinor, currency)} x={seatX(tipSeat)} y={rowY(tipRow)} mapWidth={width} />}
        </svg>
      </ZoomPan>
      <SeatLegend />
    </Stack>
  );
}
