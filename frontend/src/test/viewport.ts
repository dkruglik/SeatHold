let original: typeof window.matchMedia | undefined;
const emPx = 16;

/** Evaluates the width conditions Mantine breakpoints and our hooks use: `(max-width: Nem)` and `(min-width: Nem)`. */
function matches(query: string, width: number): boolean {
  const max = /\(max-width:\s*([\d.]+)(em|px)\)/.exec(query);
  const min = /\(min-width:\s*([\d.]+)(em|px)\)/.exec(query);
  const px = (m: RegExpExecArray) => Number(m[1]) * (m[2] === "em" ? emPx : 1);
  return (max === null || width <= px(max)) && (min === null || width >= px(min));
}

type ChangeListener = (event: MediaQueryListEvent) => void;
const listeners = new Set<{ readonly query: string; readonly listener: ChangeListener }>();

/**
 * Makes `window.matchMedia` answer as a browser window of `width` CSS pixels (jsdom has no layout).
 * Calling it again while a component listens resizes the window: the `change` listeners are notified.
 */
export function setViewport(width: number): void {
  original ??= window.matchMedia;
  window.matchMedia = ((query: string): MediaQueryList =>
    ({
      matches: matches(query, width),
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: ChangeListener) => void listeners.add({ query, listener }),
      removeEventListener: (_type: string, listener: ChangeListener) => {
        for (const entry of listeners) {
          if (entry.listener === listener) listeners.delete(entry);
        }
      },
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
  for (const { query, listener } of listeners) {
    listener({ matches: matches(query, width), media: query } as MediaQueryListEvent);
  }
}

export const narrowViewport = 360;
export const desktopViewport = 1280;

/** Restores the default stub from `setup.ts` (every query false, so a desktop layout). */
export function resetViewport(): void {
  listeners.clear();
  if (original !== undefined) {
    window.matchMedia = original;
    original = undefined;
  }
}
