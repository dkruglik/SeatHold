import { useState, type KeyboardEvent, type RefObject } from "react";
import { nextSeatId, type SeatRow } from "./seat-layout";

/**
 * Roving tabindex: one seat is the tab stop, arrows, Home, End, PageUp and PageDown move it.
 * The tab stop is a seat id, so it survives a refresh of the seats array.
 */
export function useSeatKeyboard(rows: readonly SeatRow[], svgRef: RefObject<SVGSVGElement | null>) {
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
    const element = [...(svgRef.current?.querySelectorAll<SVGElement>("[data-seat-id]") ?? [])].find((el) => el.getAttribute("data-seat-id") === target);
    element?.focus();
  }

  return { tabId, onKeyDown, onSeatFocus: setStopId };
}
