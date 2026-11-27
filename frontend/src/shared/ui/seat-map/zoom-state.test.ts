import { describe, expect, it } from "vitest";
import { clampScale, initialZoom, panBy, zoomAt } from "./zoom-state";

const size = { width: 300, height: 200 };

describe("zoom state", () => {
  it("clamps the scale to 1..3", () => {
    expect(clampScale(0.2)).toBe(1);
    expect(clampScale(2)).toBe(2);
    expect(clampScale(9)).toBe(3);
  });

  it("zooms about a point and keeps that point fixed", () => {
    const next = zoomAt(initialZoom, 2, { x: 150, y: 100 }, size);
    expect(next.scale).toBe(2);
    expect(next.x).toBe(-150);
    expect(next.y).toBe(-100);
  });

  it("never zooms past the limits", () => {
    expect(zoomAt(initialZoom, 10, { x: 0, y: 0 }, size).scale).toBe(3);
    expect(zoomAt({ scale: 2, x: -50, y: -20 }, 0.1, { x: 0, y: 0 }, size)).toEqual(initialZoom);
  });

  it("pans only within the zoomed content", () => {
    const zoomed = { scale: 2, x: 0, y: 0 };
    expect(panBy(zoomed, -100, -50, size)).toEqual({ scale: 2, x: -100, y: -50 });
    expect(panBy(zoomed, -999, -999, size)).toEqual({ scale: 2, x: -300, y: -200 });
    expect(panBy(zoomed, 50, 50, size)).toEqual(zoomed);
  });

  it("does not pan at scale 1", () => {
    expect(panBy(initialZoom, -40, -40, size)).toEqual(initialZoom);
  });
});
