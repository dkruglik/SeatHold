import { useRef, useState, type KeyboardEvent } from "react";
import { nextSeatId, type SeatRow } from "./seat-layout";

/**
 * Roving tabindex: one seat is the tab stop, arrows, Home, End, PageUp and PageDown move it.
 * The tab stop is a seat id, so it survives a refresh of the seats array.
 */
export function useSeatKeyboard(rows: readonly SeatRow[]) {
  const elements = useRef(new Map<string, SVGElement>());
  const [stopId, setStopId] = useState<string | null>(null);
  const ids = rows.flatMap(([, seats]) => seats.map((s) => s.id));
  const tabId = stopId !== null && ids.includes(stopId) ? stopId : (ids[0] ?? null);

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const current = (event.target as Element).closest("[data-seat-id]")?.getAttribute("data-seat-id");
    const target = current === null || current === undefined ? null : nextSeatId(rows, current, event.key);
    if (target === null) {
      return;
    }
    event.preventDefault();
    setStopId(target);
    elements.current.get(target)?.focus();
  }

  /** Callback ref for a seat's element: keeps the id-to-element map current, so a key press is one lookup, not a DOM query. */
  function registerSeat(id: string, element: SVGElement | null) {
    if (element === null) {
      elements.current.delete(id);
    } else {
      elements.current.set(id, element);
    }
  }

  return { tabId, onKeyDown, onSeatFocus: setStopId, registerSeat };
}
