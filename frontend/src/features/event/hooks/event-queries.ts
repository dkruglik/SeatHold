import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useFrontendConfig } from "../../../app/config/config-context";
import type { CurrentHold, EventDetail, PublicSeatMap } from "../types";
import { useEventApi } from "./use-event-api";

export const eventKeys = {
  event: (eventId: string) => ["event", eventId] as const,
  seats: (eventId: string) => ["event", eventId, "seats"] as const,
  hold: (eventId: string) => ["event", eventId, "hold"] as const,
};

export function useEventDetail(eventId: string): UseQueryResult<EventDetail> {
  const api = useEventApi();
  return useQuery({ queryKey: eventKeys.event(eventId), queryFn: () => api.event(eventId), retry: false });
}

/**
 * The public seat map, refreshed every `seatPollIntervalMs` while the page is mounted and the tab is visible:
 * the observer goes away on unmount, and background polling is off.
 */
export function useSeatMap(eventId: string): UseQueryResult<PublicSeatMap> {
  const api = useEventApi();
  const { seatPollIntervalMs } = useFrontendConfig();
  return useQuery({
    queryKey: eventKeys.seats(eventId),
    queryFn: () => api.seatMap(eventId),
    refetchInterval: seatPollIntervalMs,
    refetchIntervalInBackground: false,
    retry: false,
  });
}

/** The viewer's hold (`null` for none). It is the only source of "my seats"; the public map cannot tell them from others'. */
export function useMyHold(eventId: string): UseQueryResult<CurrentHold | null> {
  const api = useEventApi();
  return useQuery({
    queryKey: eventKeys.hold(eventId),
    queryFn: () => api.currentHold(eventId),
    refetchOnWindowFocus: "always",
    retry: false,
  });
}
