import { createHash } from "node:crypto";

/** mulberry32: a small deterministic PRNG. Returns a function giving floats in [0, 1). Not for security. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, bound). */
export function pickIndex(random: () => number, bound: number): number {
  return Math.floor(random() * bound);
}

/** A stable UUID (version and variant bits set) derived from a seed key, so a re-run inserts the same ids. */
export function seedUuid(key: string): string {
  const bytes = createHash("sha256").update(`seathold-catalog-seed:${key}`).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
