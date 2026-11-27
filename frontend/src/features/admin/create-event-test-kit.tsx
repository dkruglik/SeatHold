import { fireEvent, screen } from "@testing-library/react";
import { berlinEvent, json, renderAdmin, type Handler } from "./admin-test-kit";

export const created = { eventId: berlinEvent.eventId, showId: "s", venueId: "v", title: "Night Songs", startsAt: "2030-01-01T10:00:00.000Z", priceMinor: 4550, currency: "EUR", rows: 10, seatsPerRow: 20, seatCount: 200 };
export const post = (handler: Handler = () => json(created, 201)) => ({ "POST /api/admin/events": handler });
const detail = { [`GET /api/admin/events/${berlinEvent.eventId}/open-tickets`]: () => json({ event: { eventId: berlinEvent.eventId, showTitle: "Night Songs", startsAt: berlinEvent.startsAt, timezone: "Europe/Berlin" }, items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }) };

const nextYear = new Date(Date.now() + 365 * 24 * 3600 * 1000);
export const futureLocal = `${nextYear.getFullYear()}-${String(nextYear.getMonth() + 1).padStart(2, "0")}-${String(nextYear.getDate()).padStart(2, "0")}T19:30`;

export async function setup(handlers: Record<string, Handler> = post()) {
  const view = renderAdmin("/admin/events/new", { ...detail, ...handlers });
  await screen.findByLabelText(/^Show( \*)?$/);
  const field = (name: RegExp) => screen.getByLabelText(name);
  const setText = async (name: RegExp, value: string) => {
    await view.user.clear(field(name));
    await view.user.type(field(name), value);
  };
  const fillCommon = async () => {
    fireEvent.change(field(/^Starts at/), { target: { value: futureLocal } });
    await setText(/^Price/, "45.50");
    await setText(/^Rows( \*)?$/, "10");
    await setText(/^Seats per row( \*)?$/, "20");
  };
  const submit = () => view.user.click(screen.getByRole("button", { name: "Create event" }));
  return { ...view, field, setText, fillCommon, submit };
}
