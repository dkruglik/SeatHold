/** The one place that decides what an email address looks like once it is accepted: trimmed, case kept. */
export function normalizeEmail(raw: string): string {
  return raw.trim();
}

/** Addresses are case-insensitive. The database enforces the same rule through citext. */
export function emailsEqual(a: string, b: string): boolean {
  return normalizeEmail(a).toLowerCase() === normalizeEmail(b).toLowerCase();
}

const MAX_EMAIL_LENGTH = 254;

/** Shape check only (one @, a dotted domain, no spaces, at most 254 characters). Deliverability is the mail system's business. */
export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  return email.length <= MAX_EMAIL_LENGTH && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email);
}
