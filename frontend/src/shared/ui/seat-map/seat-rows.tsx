import { SeatButton } from "./seat-button";
import { rowLabelFontSize } from "./seat-tokens";
import { labelWidth, pitch, rowCenterY, rowY, seatX, type SeatRow } from "./seat-layout";
import type { SeatMapSeat } from "./types";

function RowLabel({ x, y, label, hidden }: { readonly x: number; readonly y: number; readonly label: string; readonly hidden?: boolean }) {
  return (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={rowLabelFontSize} fill="currentColor" aria-hidden={hidden ? true : undefined}>
      {label}
    </text>
  );
}

interface SeatRowsProps {
  readonly rows: readonly SeatRow[];
  readonly seatsPerRow: number;
  readonly disabled: boolean;
  readonly onSelect: (seat: SeatMapSeat) => void;
  readonly tabId: string | null;
  readonly registerSeat: (id: string, element: SVGElement | null) => void;
  readonly tooltipFor: (id: string) => string | undefined;
  readonly onFocusSeat: (id: string) => void;
  readonly onBlurSeat: () => void;
  readonly onHoverSeat: (id: string | null) => void;
}

/** Each row with its label on both sides (the right one hidden from assistive tech) and its seats. */
export function SeatRows({ rows, seatsPerRow, disabled, onSelect, tabId, registerSeat, tooltipFor, onFocusSeat, onBlurSeat, onHoverSeat }: SeatRowsProps) {
  const rightLabelX = labelWidth + seatsPerRow * pitch + labelWidth / 2;
  return rows.map(([label, rowSeats], rowIndex) => (
    <g key={label}>
      <RowLabel x={labelWidth / 2} y={rowCenterY(rowIndex)} label={label} />
      <RowLabel x={rightLabelX} y={rowCenterY(rowIndex)} label={label} hidden />
      {rowSeats.map((seat) => (
        <SeatButton
          key={seat.id}
          seat={seat}
          x={seatX(seat)}
          y={rowY(rowIndex)}
          disabled={disabled}
          onSelect={onSelect}
          tabbable={seat.id === tabId}
          registerSeat={registerSeat}
          describedBy={tooltipFor(seat.id)}
          onFocusSeat={onFocusSeat}
          onBlurSeat={onBlurSeat}
          onHoverSeat={onHoverSeat}
        />
      ))}
    </g>
  ));
}
