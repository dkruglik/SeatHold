const locale = "en";

/** The start time on the venue's wall clock, e.g. "Wed, 1 Jul 2026, 19:30", and the timezone it is in. */
export function formatStart(startsAt: string, timezone: string): { readonly text: string; readonly timezone: string } {
  const date = new Date(startsAt);
  try {
    const text = new Intl.DateTimeFormat(locale, {
      timeZone: timezone, weekday: "short", day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(date);
    return { text, timezone };
  } catch {
    return { text: date.toISOString(), timezone: "UTC" };
  }
}

/** `priceMinor` is in the currency's minor unit; the number of decimals comes from the currency, not from a fixed 100. */
export function formatPrice(priceMinor: number, currency: string): string {
  try {
    const format = new Intl.NumberFormat(locale, { style: "currency", currency });
    const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
    return format.format(priceMinor / 10 ** digits);
  } catch {
    return `${(priceMinor / 100).toFixed(2)} ${currency}`;
  }
}

export function seatsLabel(seatsLeft: number): string {
  return seatsLeft === 1 ? "1 seat left" : `${seatsLeft} seats left`;
}
