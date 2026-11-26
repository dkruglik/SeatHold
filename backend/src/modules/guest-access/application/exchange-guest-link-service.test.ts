import { describe, expect, it } from "vitest";
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

    expect(result.bookingId).toBe("b1");
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
