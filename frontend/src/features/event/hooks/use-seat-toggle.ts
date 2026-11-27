import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../shared/lib/api-client";
import { type SeatMapSeat } from "../../../shared/ui";
import { eventKeys } from "./event-queries";
import { useEventApi } from "./use-event-api";

export function holdErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "SEAT_UNAVAILABLE") {
    return "That seat was just taken. Pick another one.";
  }
  if (error instanceof ApiError && error.code === "HOLD_LIMIT_REACHED") {
    return "You have reached the maximum number of seats for one hold. Release a seat to pick another.";
  }
  return "Could not update your selection. Try again.";
}

export interface SeatToggle {
  readonly toggle: (seat: SeatMapSeat) => void;
  readonly pending: boolean;
  readonly message: string | null;
}

/** Clicking an available seat holds it; clicking my own seat releases it. The map and the hold are refetched either way. */
export function useSeatToggle(eventId: string): SeatToggle {
  const api = useEventApi();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (seat: SeatMapSeat) => {
      if (seat.state === "held_by_me") {
        await api.release(eventId, seat.id);
      } else {
        queryClient.setQueryData(eventKeys.hold(eventId), await api.hold(eventId, seat.id));
      }
    },
    // Awaited, so the map stays inert until it shows the new state (a released seat must not flash as someone else's).
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: eventKeys.seats(eventId) }),
        queryClient.invalidateQueries({ queryKey: eventKeys.hold(eventId) }),
      ]),
  });
  return {
    toggle: (seat) => mutation.mutate(seat),
    pending: mutation.isPending,
    message: mutation.isError ? holdErrorMessage(mutation.error) : null,
  };
}
