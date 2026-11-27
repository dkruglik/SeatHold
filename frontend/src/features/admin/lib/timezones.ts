/** Suggestions for the time zone field; any valid IANA zone is accepted. */
export const commonTimezones = [
  "UTC", "Europe/London", "Europe/Berlin", "Europe/Paris", "Europe/Madrid", "Europe/Rome", "Europe/Vienna",
  "America/New_York", "America/Chicago", "America/Los_Angeles", "Asia/Tokyo", "Asia/Jerusalem", "Australia/Sydney",
] as const;

export function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value.trim() !== "";
  } catch {
    return false;
  }
}
