import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { desktopViewport, narrowViewport, setViewport } from "../../test/viewport";
import { useNarrow } from "./use-narrow";

describe("useNarrow", () => {
  it("is read at the first render", () => {
    setViewport(narrowViewport);
    expect(renderHook(() => useNarrow()).result.current).toBe(true);
  });

  it("follows a resize between phone and desktop width", () => {
    setViewport(desktopViewport);
    const { result } = renderHook(() => useNarrow());
    expect(result.current).toBe(false);

    act(() => setViewport(narrowViewport));
    expect(result.current).toBe(true);

    act(() => setViewport(desktopViewport));
    expect(result.current).toBe(false);
  });
});
