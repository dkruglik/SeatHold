let original: typeof window.matchMedia | undefined;
const emPx = 16;

/** Evaluates the width conditions Mantine breakpoints and our hooks use: `(max-width: Nem)` and `(min-width: Nem)`. */
function matches(query: string, width: number): boolean {
  const max = /\(max-width:\s*([\d.]+)(em|px)\)/.exec(query);
  const min = /\(min-width:\s*([\d.]+)(em|px)\)/.exec(query);
  const px = (m: RegExpExecArray) => Number(m[1]) * (m[2] === "em" ? emPx : 1);
  return (max === null || width <= px(max)) && (min === null || width >= px(min));
}

/** Makes `window.matchMedia` answer as a browser window of `width` CSS pixels (jsdom has no layout). */
export function setViewport(width: number): void {
  original ??= window.matchMedia;
  window.matchMedia = ((query: string): MediaQueryList =>
    ({
      matches: matches(query, width),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
}

export const narrowViewport = 360;
export const desktopViewport = 1280;

/** Restores the default stub from `setup.ts` (every query false, so a desktop layout). */
export function resetViewport(): void {
  if (original !== undefined) {
    window.matchMedia = original;
    original = undefined;
  }
}
