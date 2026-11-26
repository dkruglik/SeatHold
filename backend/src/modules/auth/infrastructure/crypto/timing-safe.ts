import crypto from "node:crypto";

/** Equality of two hex strings in constant time for equal lengths. Different lengths are simply not equal. */
export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}
