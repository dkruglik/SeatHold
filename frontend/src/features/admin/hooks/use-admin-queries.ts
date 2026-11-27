import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";
import { useApiClient } from "../../../app/api-client-context";
import { AdminApi } from "../services/admin-api";
import type { AdminEventRow, BoughtTicket, CreateEventRequest, CreatedEvent, Lookups, OpenTicket, Paged, ReleaseResult, TicketPage } from "../types";

export const PAGE_SIZE = 20;

const keys = {
  events: ["admin", "events"] as const,
  lookups: ["admin", "lookups"] as const,
  tickets: (eventId: string) => ["admin", "event", eventId, "tickets"] as const,
};

function useAdminApi(): AdminApi {
  const client = useApiClient();
  return useMemo(() => new AdminApi(client), [client]);
}

/** Server state, not retried: a 401/403 or a failure is shown at once. Previous page stays while the next loads. */
export function useAdminEvents(page: number): UseQueryResult<Paged<AdminEventRow>> {
  const api = useAdminApi();
  return useQuery({ queryKey: [...keys.events, page], queryFn: () => api.listEvents(page, PAGE_SIZE), retry: false, placeholderData: keepPreviousData });
}

export function useLookups(): UseQueryResult<Lookups> {
  const api = useAdminApi();
  return useQuery({ queryKey: keys.lookups, queryFn: () => api.lookups(), retry: false });
}

export function useOpenTickets(eventId: string, page: number): UseQueryResult<TicketPage<OpenTicket>> {
  const api = useAdminApi();
  return useQuery({ queryKey: [...keys.tickets(eventId), "open", page], queryFn: () => api.openTickets(eventId, page, PAGE_SIZE), retry: false, placeholderData: keepPreviousData });
}

/** Only mounted when its tab is open, so it is fetched lazily. */
export function useBoughtTickets(eventId: string, page: number): UseQueryResult<TicketPage<BoughtTicket>> {
  const api = useAdminApi();
  return useQuery({ queryKey: [...keys.tickets(eventId), "bought", page], queryFn: () => api.boughtTickets(eventId, page, PAGE_SIZE), retry: false, placeholderData: keepPreviousData });
}

export function useCreateEvent(): UseMutationResult<CreatedEvent, Error, CreateEventRequest> {
  const api = useAdminApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request) => api.createEvent(request),
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: keys.events }), queryClient.invalidateQueries({ queryKey: keys.lookups })]),
  });
}

interface Release {
  readonly seatId: string;
  readonly reason: string;
}

/** After the call (success or 409) both ticket lists and the event counts are refetched. */
export function useReleaseSeat(eventId: string): UseMutationResult<ReleaseResult, Error, Release> {
  const api = useAdminApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ seatId, reason }) => api.releaseSeat(eventId, seatId, reason),
    onSettled: () => Promise.all([queryClient.invalidateQueries({ queryKey: keys.tickets(eventId), refetchType: "all" }), queryClient.invalidateQueries({ queryKey: keys.events })]),
  });
}
