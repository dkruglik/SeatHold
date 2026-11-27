import type { SeatState } from "./types";

export const markerSize = 24;

interface StateLook {
  /** Shown to people and exposed as the seat's accessible state. */
  readonly label: string;
  /** The shape cue that tells the states apart without color. */
  readonly marker: "outline" | "dashed" | "cross" | "check";
}

export const stateLook: Record<SeatState, StateLook> = {
  available: { label: "available", marker: "outline" },
  held: { label: "held by someone else", marker: "dashed" },
  sold: { label: "sold", marker: "cross" },
  held_by_me: { label: "selected by you", marker: "check" },
};

// Theme variables only, so the markers follow the color scheme (light and dark).
const accent = "var(--mantine-primary-color-filled)";
const onAccent = "var(--mantine-primary-color-contrast)";
const muted = "var(--mantine-color-dimmed)";
const ink = "var(--mantine-color-text)";
const page = "var(--mantine-color-body)";

/** The shape of one seat in one state, drawn in a markerSize square at the origin of its parent. */
export function SeatMarker({ state }: { readonly state: SeatState }) {
  const box = { width: markerSize, height: markerSize, rx: 5 };
  switch (state) {
    case "available":
      return <rect {...box} fill={page} stroke={accent} strokeWidth={2} />;
    case "held":
      return (
        <g>
          <rect {...box} fill="var(--mantine-color-default-hover)" stroke={muted} strokeWidth={2} strokeDasharray="4 3" />
          <path d="M7 12h10" stroke={muted} strokeWidth={2} strokeLinecap="round" />
        </g>
      );
    case "sold":
      return (
        <g>
          <rect {...box} fill={ink} />
          <path d="M8 8l8 8M16 8l-8 8" stroke={page} strokeWidth={2} strokeLinecap="round" />
        </g>
      );
    case "held_by_me":
      return (
        <g>
          <rect {...box} fill={accent} />
          <path d="M6 12.5l4 4 8-9" stroke={onAccent} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
  }
}
