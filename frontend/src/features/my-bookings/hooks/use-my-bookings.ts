import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";
import { useApiClient } from "../../../app/api-client-context";
import type { Booking } from "../../../shared/ui/booking-card";
import { BookingsApi } from "../services/bookings-api";

/** Server state of the user's bookings, newest first. Not retried: a 401 or a failure is shown at once. */
export function useMyBookings(): UseQueryResult<Booking[]> {
  const client = useApiClient();
  const api = useMemo(() => new BookingsApi(client), [client]);
  return useQuery({ queryKey: ["me", "bookings"], queryFn: () => api.list(), retry: false });
}
