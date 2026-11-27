import type { ApiClient } from "../../../shared/lib/api-client";
import type { AdminEventRow, BoughtTicket, CreateEventRequest, CreatedEvent, Lookups, OpenTicket, Paged, ReleaseResult, TicketPage } from "../types";

const paging = (page: number, pageSize: number) => `?page=${page}&pageSize=${pageSize}`;

/** The back office API. Every route is admin-only on the server; the client guard is UX only. */
export class AdminApi {
  constructor(private readonly client: ApiClient) {}

  listEvents(page: number, pageSize: number): Promise<Paged<AdminEventRow>> {
    return this.client.get(`/admin/events${paging(page, pageSize)}`);
  }

  lookups(): Promise<Lookups> {
    return this.client.get("/admin/lookups");
  }

  createEvent(request: CreateEventRequest): Promise<CreatedEvent> {
    return this.client.post("/admin/events", request);
  }

  openTickets(eventId: string, page: number, pageSize: number): Promise<TicketPage<OpenTicket>> {
    return this.client.get(`/admin/events/${encodeURIComponent(eventId)}/open-tickets${paging(page, pageSize)}`);
  }

  boughtTickets(eventId: string, page: number, pageSize: number): Promise<TicketPage<BoughtTicket>> {
    return this.client.get(`/admin/events/${encodeURIComponent(eventId)}/bought-tickets${paging(page, pageSize)}`);
  }

  releaseSeat(eventId: string, seatId: string, reason: string): Promise<ReleaseResult> {
    return this.client.post(`/admin/events/${encodeURIComponent(eventId)}/seats/${encodeURIComponent(seatId)}/release`, { reason });
  }
}
