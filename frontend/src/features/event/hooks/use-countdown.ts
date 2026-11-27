import { useEffect, useState } from "react";

/**
 * Whole seconds left until `expiresAt` (ISO instant), ticking once per second; `null` without a deadline.
 * The hold DTO carries no server time, so this compares against the browser clock (Date.now()): a skewed clock
 * shifts the display, while the backend stays the authority on expiry.
 */
export function useCountdown(expiresAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (expiresAt === null) {
      return;
    }
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return expiresAt === null ? null : Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
}

/** mm:ss */
export function formatRemaining(totalSeconds: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`;
}
