import { useMediaQuery } from "@mantine/hooks";

/** Below the theme's `sm` breakpoint (48em): the phone layout. */
const narrowQuery = "(max-width: 47.99em)";

/** True on a phone-width window. Read at the first render, so the layout does not flash from desktop to phone; it also follows later viewport changes (`useMediaQuery` listens to `change`, tested in `use-narrow.test.tsx`). */
export function useNarrow(): boolean {
  return useMediaQuery(narrowQuery, false, { getInitialValueInEffect: false });
}
