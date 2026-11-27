import { useRef, useState, type PointerEvent, type RefObject } from "react";
import { initialZoom, panBy, zoomAt, zoomStep, type Point, type Size, type ZoomState } from "./zoom-state";

const dragThreshold = 6;
export { zoomStep };

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function measure(frame: RefObject<HTMLDivElement | null>): { size: Size; origin: Point } {
  const box = frame.current?.getBoundingClientRect();
  return { size: { width: box?.width ?? 0, height: box?.height ?? 0 }, origin: { x: box?.left ?? 0, y: box?.top ?? 0 } };
}

function pinched(z: ZoomState, current: Point, other: Point, before: number, box: { size: Size; origin: Point }): ZoomState {
  const focal = { x: (current.x + other.x) / 2 - box.origin.x, y: (current.y + other.y) / 2 - box.origin.y };
  return before > 0 ? zoomAt(z, (z.scale * distance(current, other)) / before, focal, box.size) : z;
}

/** Tracks the pointers on the frame and reports a pinch (with the other pointer) or a single-pointer move. */
function usePointerTracking(onPinch: (current: Point, other: Point, before: number) => void, onDrag: (previous: Point, current: Point) => void) {
  const pointers = useRef(new Map<number, Point>());
  const dragged = useRef(false);
  const travel = useRef(0);

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (previous === undefined) {
      return;
    }
    const current = { x: event.clientX, y: event.clientY };
    const other = [...pointers.current].find(([id]) => id !== event.pointerId)?.[1];
    pointers.current.set(event.pointerId, current);
    if (other === undefined) {
      travel.current += distance(previous, current);
      dragged.current = travel.current > dragThreshold;
      onDrag(previous, current);
    } else {
      dragged.current = true;
      onPinch(current, other, distance(previous, other));
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragged.current = false;
    travel.current = 0;
  }

  /** A drag that ended on a seat must not also select it. */
  function onClickCapture(event: { stopPropagation: () => void }) {
    if (dragged.current) {
      dragged.current = false;
      event.stopPropagation();
    }
  }

  const release = (event: PointerEvent<HTMLDivElement>) => void pointers.current.delete(event.pointerId);
  return { onPointerDown, onPointerMove, onPointerUp: release, onPointerCancel: release, onPointerLeave: release, onClickCapture };
}

/** Local zoom state with pinch (two pointers), drag-to-pan when zoomed, and button zoom about the center. */
export function useZoomGestures(frame: RefObject<HTMLDivElement | null>) {
  const [zoom, setZoom] = useState<ZoomState>(initialZoom);
  const handlers = usePointerTracking(
    (current, other, before) => {
      const box = measure(frame);
      setZoom((z) => pinched(z, current, other, before, box));
    },
    (previous, current) => {
      const { size } = measure(frame);
      setZoom((z) => (z.scale > 1 ? panBy(z, current.x - previous.x, current.y - previous.y, size) : z));
    },
  );

  return {
    zoom,
    zoomBy(factor: number) {
      const { size } = measure(frame);
      setZoom((z) => zoomAt(z, z.scale * factor, { x: size.width / 2, y: size.height / 2 }, size));
    },
    reset: () => setZoom(initialZoom),
    handlers,
  };
}
