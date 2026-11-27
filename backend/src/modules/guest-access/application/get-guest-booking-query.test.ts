import { describe, expect, it } from "vitest";
import { AuthenticationError } from "../../../shared/errors/app-error.js";
import { setup, tokenIn } from "./guest-access-fixtures.test-support.js";
import { DAY, EVENT_START, T0, booking } from "./in-memory-guest-access.test-support.js";

async function session() {
  const ctx = setup();
  ctx.bookings.confirmed.set("b1", booking("b1"));
  await ctx.issue.issue({ bookingId: "b1", email: "g@example.com", eventStartsAt: EVENT_START, eventTitle: "Rock Night" });
  const { sessionToken } = await ctx.exchange.exchange({ token: tokenIn(ctx.email.sent[0]?.text ?? "") });
  return { ...ctx, sessionToken };
}

describe("GetGuestBookingQuery", () => {
  it("returns the one booking with its tickets for a live session", async () => {
    const { getBooking, sessionToken } = await session();

    const result = await getBooking.get({ sessionToken });

    expect(result).toMatchObject({ bookingId: "b1", status: "confirmed", tickets: [{ code: "CODE" }] });
  });

  it("answers 401 for an unknown session and for an expired one", async () => {
    const { getBooking, sessionToken, clock } = await session();

    expect(await getBooking.get({ sessionToken: "unknown" }).catch((e: unknown) => e)).toBeInstanceOf(AuthenticationError);
    clock.set(new Date(EVENT_START.getTime() + DAY));
    expect(await getBooking.get({ sessionToken }).catch((e: unknown) => e)).toBeInstanceOf(AuthenticationError);
  });

  it("answers 401 for a revoked session", async () => {
    const { getBooking, sessionToken, sessions } = await session();

    await sessions.revokeForBookings(["b1"], T0);

    expect(await getBooking.get({ sessionToken }).catch((e: unknown) => e)).toBeInstanceOf(AuthenticationError);
  });
});
