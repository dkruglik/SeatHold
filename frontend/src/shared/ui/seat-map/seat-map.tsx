import { Stack } from "@mantine/core";
import { SeatButton } from "./seat-button";
import { SeatLegend } from "./seat-legend";
import { markerSize } from "./seat-marker";
import type { SeatMapProps, SeatMapSeat } from "./types";

const pitch = 32;
const labelWidth = 28;

function groupByRow(seats: readonly SeatMapSeat[]): Array<[string, SeatMapSeat[]]> {
  const rows = new Map<string, SeatMapSeat[]>();
  for (const seat of seats) {
    rows.set(seat.row, [...(rows.get(seat.row) ?? []), seat]);
  }
  return [...rows];
}

/**
 * A grid of seats drawn as SVG. Presentational only: the caller owns the seat states and decides what a selection does.
 * Each seat is named "Row C, seat 7, available"; the four states differ in shape (outline, dashed, cross, check), not just color.
 */
export function SeatMap({ rows, seatsPerRow, seats, onSelect, disabled = false }: SeatMapProps) {
  const byRow = groupByRow(seats);
  const width = labelWidth + seatsPerRow * pitch;
  const height = Math.max(rows, byRow.length) * pitch;
  return (
    <Stack gap="sm">
      <svg
        role="group"
        aria-label="Seat map"
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", maxWidth: width * 1.5, height: "auto" }}
      >
        {byRow.map(([label, rowSeats], rowIndex) => (
          <g key={label}>
            <text x={labelWidth / 2} y={rowIndex * pitch + markerSize / 2} textAnchor="middle" dominantBaseline="central" fontSize={13} fill="currentColor">
              {label}
            </text>
            {rowSeats.map((seat) => (
              <SeatButton
                key={seat.id}
                seat={seat}
                x={labelWidth + (seat.number - 1) * pitch}
                y={rowIndex * pitch}
                disabled={disabled}
                onSelect={onSelect}
              />
            ))}
          </g>
        ))}
      </svg>
      <SeatLegend />
    </Stack>
  );
}
