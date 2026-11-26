import { describe, expect, it } from "vitest";
import { InfrastructureError } from "../../../shared/errors/app-error.js";
import { LinkExpired, LinkInvalid, LinkUsed } from "../domain/errors.js";
import { ORIGIN, setup, tokenIn } from "./guest-access-fixtures.test-support.js";
import { DAY, EVENT_START, HOUR, booking } from "./in-memory-guest-access.test-support.js";

async function issued() {
  const ctx = setup();
  ctx.bookings.confirmed.set("b1", booking("b1"));
  await ctx.issue.issue({ bookingId: "b1", email: "g@example.com", eventStartsAt: EVENT_START, eventTitle: "Rock Night" });
  return { ...ctx, token: tokenIn(ctx.email.sent[0]?.text ?? "") };
}

describe("ExchangeGuestLinkService", () => {
  it("consumes the link and creates a session valid until the event start plus one day, storing only its hash", async () => {
    const { exchange, sessions, token, tokens } = await issued();

    const result = await exchange.exchange({ token });

    expect(result.booking).toMatchObject({ bookingId: "b1", status: "confirmed", tickets: [{ code: "CODE" }] });
    expect(result.expiresAt).toEqual(new Date(EVENT_START.getTime() + DAY));
    expect(sessions.rows).toHaveLength(1);
    expect(sessions.rows[0]?.tokenHash).toBe(tokens.hash(result.sessionToken));
    expect(JSON.stringify(sessions.rows)).not.toContain(result.sessionToken);
    expect(result.sessionToken).not.toBe(token);
    expect(ORIGIN).toBeTruthy();
  });

  it("answers LINK_USED on the second exchange and creates no second session", async () => {
    const { exchange, sessions, token } = await issued();
    await exchange.exchange({ token });

    const error = await exchange.exchange({ token }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(LinkUsed);
    expect(sessions.rows).toHaveLength(1);
  });

  it("answers LINK_EXPIRED after the lifetime and LINK_INVALID for an unknown token", async () => {
    const { exchange, clock, token } = await issued();
    clock.advance(168 * HOUR);

    expect(await exchange.exchange({ token }).catch((e: unknown) => e)).toBeInstanceOf(LinkExpired);
    expect(await exchange.exchange({ token: "nope" }).catch((e: unknown) => e)).toBeInstanceOf(LinkInvalid);
  });

});

describe("ExchangeGuestLinkService failures before the session exists", () => {
  it("answers LINK_INVALID without consuming the link when the booking cannot be read, and the same link works once it can", async () => {
    const { exchange, bookings, links, sessions, token } = await issued();
    bookings.confirmed.delete("b1");

    expect(await exchange.exchange({ token }).catch((e: unknown) => e)).toBeInstanceOf(LinkInvalid);

    expect(links.rows[0]?.consumedAt).toBeNull();
    expect(sessions.rows).toHaveLength(0);
    bookings.confirmed.set("b1", booking("b1"));
    expect((await exchange.exchange({ token })).booking.bookingId).toBe("b1");
  });

  it("leaves the link consumable and creates no session when the consume-and-session statement fails", async () => {
    const { exchange, links, sessions, token } = await issued();
    links.failConsume = true;

    expect(await exchange.exchange({ token }).catch((e: unknown) => e)).toBeInstanceOf(InfrastructureError);

    expect(links.rows[0]?.consumedAt).toBeNull();
    expect(sessions.rows).toHaveLength(0);
    links.failConsume = false;
    await expect(exchange.exchange({ token })).resolves.toMatchObject({ booking: { bookingId: "b1" } });
    expect(sessions.rows).toHaveLength(1);
  });

  it("answers LINK_USED to a concurrent loser, with exactly one session in total", async () => {
    const { exchange, sessions, token } = await issued();

    const results = await Promise.allSettled([exchange.exchange({ token }), exchange.exchange({ token })]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason)).toEqual([expect.any(LinkUsed)]);
    expect(sessions.rows).toHaveLength(1);
  });
});
