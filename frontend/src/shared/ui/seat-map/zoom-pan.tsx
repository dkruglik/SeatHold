import { Button, Group } from "@mantine/core";
import { useRef, type ReactNode } from "react";
import { useZoomGestures, zoomStep } from "./use-zoom-gestures";

/**
 * Pinch zoom, drag to pan when zoomed, and Zoom in, Zoom out and Reset view buttons for narrow screens.
 * The state is local and not persisted. At scale 1 the content is not draggable, so the page scrolls as usual.
 */
export function ZoomPan({ children }: { readonly children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const { zoom, zoomBy, reset, handlers } = useZoomGestures(frame);
  return (
    <div>
      <Group gap="xs" mb="xs" hiddenFrom="sm" role="group" aria-label="Zoom">
        <Button size="lg" variant="default" onClick={() => zoomBy(zoomStep)}>Zoom in</Button>
        <Button size="lg" variant="default" onClick={() => zoomBy(1 / zoomStep)}>Zoom out</Button>
        <Button size="lg" variant="default" onClick={reset}>Reset view</Button>
      </Group>
      <div ref={frame} style={{ overflow: "clip", touchAction: zoom.scale > 1 ? "none" : "pan-x pan-y" }} {...handlers}>
        <div
          data-testid="zoom-content"
          data-scale={zoom.scale}
          style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`, transformOrigin: "0 0" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
