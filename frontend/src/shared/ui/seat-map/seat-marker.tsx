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

const blue = "var(--mantine-color-blue-7)";
const gray = "var(--mantine-color-gray-6)";
const dark = "var(--mantine-color-dark-7, #1a1b1e)";

/** The shape of one seat in one state, drawn in a markerSize square at the origin of its parent. */
export function SeatMarker({ state }: { readonly state: SeatState }) {
  const box = { width: markerSize, height: markerSize, rx: 5 };
  switch (state) {
    case "available":
      return <rect {...box} fill="var(--mantine-color-body)" stroke={blue} strokeWidth={2} />;
    case "held":
      return (
        <g>
          <rect {...box} fill="var(--mantine-color-gray-2)" stroke={gray} strokeWidth={2} strokeDasharray="4 3" />
          <path d="M7 12h10" stroke={gray} strokeWidth={2} strokeLinecap="round" />
        </g>
      );
    case "sold":
      return (
        <g>
          <rect {...box} fill={dark} />
          <path d="M8 8l8 8M16 8l-8 8" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
        </g>
      );
    case "held_by_me":
      return (
        <g>
          <rect {...box} fill={blue} />
          <path d="M6 12.5l4 4 8-9" stroke="#fff" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
  }
}
