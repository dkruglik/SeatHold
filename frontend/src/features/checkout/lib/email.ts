const maxLength = 254;
const shape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A client-side shape check for fast feedback; the backend validates the address again. */
export function isPlausibleEmail(value: string): boolean {
  return value.length <= maxLength && shape.test(value);
}
