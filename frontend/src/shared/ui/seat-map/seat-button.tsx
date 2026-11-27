import { useState, type KeyboardEvent } from "react";
import { SeatMarker, stateLook } from "./seat-marker";
import { markerSize } from "./seat-tokens";
import type { SeatMapSeat } from "./types";

interface SeatButtonProps {
  readonly seat: SeatMapSeat;
  readonly x: number;
  readonly y: number;
  readonly disabled: boolean;
  readonly onSelect: (seat: SeatMapSeat) => void;
  /** Roving tabindex: only the current tab stop is 0. */
  readonly tabbable: boolean;
  /** Hands the seat's element to the keyboard hook (callback ref). */
  readonly registerSeat: (id: string, element: SVGElement | null) => void;
  /** Id of the tooltip while it is shown for this seat. */
  readonly describedBy?: string | undefined;
  readonly onFocusSeat: (id: string) => void;
  readonly onBlurSeat: () => void;
  readonly onHoverSeat: (id: string | null) => void;
}

/** One seat: an SVG element with the button role, focusable, activated by click, Enter or Space. */
export function SeatButton({ seat, x, y, disabled, onSelect, tabbable, registerSeat, describedBy, onFocusSeat, onBlurSeat, onHoverSeat }: SeatButtonProps) {
  const [focused, setFocused] = useState(false);
  const look = stateLook[seat.state];
  const selectable = !disabled && (seat.state === "available" || seat.state === "held_by_me");
  const toggles = seat.state === "available" || seat.state === "held_by_me";

  function activate() {
    if (selectable) {
      onSelect(seat);
    }
  }

  function onKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  }

  return (
    <g
      ref={(element) => registerSeat(seat.id, element)}
      role="button"
      tabIndex={tabbable ? 0 : -1}
      data-seat-id={seat.id}
      aria-describedby={describedBy}
      aria-label={`Row ${seat.row}, seat ${seat.number}, ${look.label}`}
      aria-pressed={toggles ? seat.state === "held_by_me" : undefined}
      aria-disabled={selectable ? undefined : true}
      data-marker={look.marker}
      transform={`translate(${x} ${y})`}
      style={{ cursor: selectable ? "pointer" : "not-allowed", outline: "none" }}
      onClick={activate}
      onKeyDown={onKeyDown}
      onFocus={() => {
        setFocused(true);
        onFocusSeat(seat.id);
      }}
      onBlur={() => {
        setFocused(false);
        onBlurSeat();
      }}
      onMouseEnter={() => onHoverSeat(seat.id)}
      onMouseLeave={() => onHoverSeat(null)}
    >
      <SeatMarker state={seat.state} />
      {focused ? (
        <rect x={-3} y={-3} width={markerSize + 6} height={markerSize + 6} rx={8} fill="none" stroke="var(--mantine-color-text)" strokeWidth={2} />
      ) : null}
    </g>
  );
}
