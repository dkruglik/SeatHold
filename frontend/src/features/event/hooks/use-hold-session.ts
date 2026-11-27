import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { HoldSummary } from "../types";
import { eventKeys, useMyHold } from "./event-queries";
import { useCountdown } from "./use-countdown";

export interface HoldSession {
  /** Seats of my live hold; empty once it ran out, before the server has said so. */
  readonly seatIds: readonly string[];
  readonly remainingSeconds: number | null;
  /** True from the moment my hold ran out until I hold again. */
  readonly expired: boolean;
  readonly summary: HoldSummary | null;
  readonly failed: boolean;
}

/** My hold, its countdown, and the expiry: at zero the map and the hold are refetched and the selection is cleared. */
export function useHoldSession(eventId: string): HoldSession {
  const queryClient = useQueryClient();
  const hold = useMyHold(eventId);
  const expiresAt = hold.data?.expiresAt ?? null;
  const remainingSeconds = useCountdown(expiresAt);
  const [expired, setExpired] = useState(false);
  const handled = useRef<string | null>(null);
  const ran = remainingSeconds === 0 && expiresAt !== null;

  useEffect(() => {
    if (ran && handled.current !== expiresAt) {
      handled.current = expiresAt;
      setExpired(true);
      void queryClient.invalidateQueries({ queryKey: eventKeys.hold(eventId) });
      void queryClient.invalidateQueries({ queryKey: eventKeys.seats(eventId) });
    } else if (expiresAt !== null && !ran) {
      setExpired(false);
    }
  }, [ran, expiresAt, eventId, queryClient]);

  const current = hold.data ?? null;
  const live = current !== null && !ran;
  return {
    seatIds: live ? current.seatIds : [],
    remainingSeconds: live ? remainingSeconds : null,
    expired,
    summary: live ? { eventId, seatIds: [...current.seatIds], expiresAt: current.expiresAt } : null,
    failed: hold.isError,
  };
}
