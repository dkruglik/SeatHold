import { describe, expect, it } from "vitest";
import { setup, tokenIn } from "./guest-access-fixtures.test-support.js";
import { booking, trace } from "./in-memory-guest-access.test-support.js";

describe("ResendGuestLinksService", () => {
  it("resolves for an unknown email, sends nothing, and consulted the limiter before the booking lookup", async () => {
    const { resend, email, limiter } = setup();

    const result = await resend.resend({ email: "  Nobody@Example.com " });

    expect(result).toEqual({ kind: "accepted" });
    expect(email.sent).toEqual([]);
    expect(trace.slice(0, 2)).toEqual(["limiter", "bookings.lookup"]);
    expect(limiter.calls[0]).toMatchObject({ limit: 3, windowMinutes: 60 });
  });

  it("hashes the trimmed lower-case email for the limiter, never the address itself", async () => {
    const { resend, limiter, tokens } = setup();

    await resend.resend({ email: "  Nobody@Example.com " });

    expect(limiter.calls[0]?.emailHash).toBe(tokens.hash("nobody@example.com"));
  });

  it("answers rate_limited before any lookup or send when the limit is hit", async () => {
    const { resend, email, limiter, bookings } = setup();
    limiter.allow = false;
    bookings.upcoming.set("g@example.com", [booking("b1")]);

    const result = await resend.resend({ email: "g@example.com" });

    expect(result).toEqual({ kind: "rate_limited" });
    expect(trace).toEqual(["limiter"]);
    expect(email.sent).toEqual([]);
  });

  it("for a known email invalidates old links, revokes sessions and sends a new link per booking", async () => {
    const ctx = setup();
    const { resend, email, bookings, links, sessions, issue, exchange, getBooking } = ctx;
    bookings.confirmed.set("b1", booking("b1"));
    bookings.confirmed.set("b2", booking("b2", "Jazz"));
    bookings.upcoming.set("g@example.com", [booking("b1"), booking("b2", "Jazz")]);
    await issue.issue({ bookingId: "b1", email: "g@example.com", eventStartsAt: booking("b1").event.startsAt, eventTitle: "Rock Night" });
    const oldToken = tokenIn(email.sent[0]?.text ?? "");
    const session = await exchange.exchange({ token: oldToken });
    await issue.issue({ bookingId: "b1", email: "g@example.com", eventStartsAt: booking("b1").event.startsAt, eventTitle: "Rock Night" });
    const unusedOld = tokenIn(email.sent[1]?.text ?? "");
    email.sent.length = 0;

    const result = await resend.resend({ email: "G@Example.com" });

    expect(result).toEqual({ kind: "accepted" });
    expect(email.sent).toHaveLength(2);
    expect(await exchange.exchange({ token: unusedOld }).catch((e: unknown) => (e as Error).name)).toBe("LinkInvalid");
    expect(await getBooking.get({ sessionToken: session.sessionToken }).catch((e: unknown) => (e as Error).name)).toBe("AuthenticationError");
    expect(sessions.rows[0]?.revokedAt).not.toBeNull();
    expect(links.rows.filter((r) => r.invalidatedAt === null && r.consumedAt === null)).toHaveLength(2);
    const fresh = tokenIn(email.sent[0]?.text ?? "");
    expect((await exchange.exchange({ token: fresh })).booking.bookingId).toBe("b1");
  });
});
