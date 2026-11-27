/** Why a link can or cannot be exchanged, read after a failed consume. `usable` means it changed in between. */
export type GuestLinkState = "unknown" | "usable" | "used" | "invalidated" | "expired";
