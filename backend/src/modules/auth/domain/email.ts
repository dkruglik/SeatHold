/** The one place that decides what an email address looks like once it is accepted: trimmed, case kept. */
export function normalizeEmail(raw: string): string {
  return raw.trim();
}

/** Addresses are case-insensitive. The database enforces the same rule through citext. */
export function emailsEqual(a: string, b: string): boolean {
  return normalizeEmail(a).toLowerCase() === normalizeEmail(b).toLowerCase();
}
