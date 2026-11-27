export interface ZoomState {
  readonly scale: number;
  /** Translation of the content in px, 0 or negative. */
  readonly x: number;
  readonly y: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export const minScale = 1;
export const maxScale = 3;
export const zoomStep = 1.5;
export const initialZoom: ZoomState = { scale: 1, x: 0, y: 0 };

export function clampScale(scale: number): number {
  return Math.min(maxScale, Math.max(minScale, scale));
}

/** Keeps the zoomed content covering the container: no empty edge can be panned into view. */
function clampPan(state: ZoomState, size: Size): ZoomState {
  const x = Math.min(0, Math.max(size.width * (1 - state.scale), state.x));
  const y = Math.min(0, Math.max(size.height * (1 - state.scale), state.y));
  return { scale: state.scale, x: x + 0, y: y + 0 };
}

/** Zooms to `scale`, keeping the content under `focal` (container coordinates) where it is. */
export function zoomAt(state: ZoomState, scale: number, focal: Point, size: Size): ZoomState {
  const next = clampScale(scale);
  const ratio = next / state.scale;
  return clampPan({ scale: next, x: focal.x - (focal.x - state.x) * ratio, y: focal.y - (focal.y - state.y) * ratio }, size);
}

export function panBy(state: ZoomState, dx: number, dy: number, size: Size): ZoomState {
  return clampPan({ ...state, x: state.x + dx, y: state.y + dy }, size);
}
