import { describe, expect, it } from "vitest";
import { EVENT_STARTS_AT, MS_PER_DAY, useGuestApp } from "./guest-route-test-support.js";

const harness = useGuestApp();

describe("GET /api/guest/booking", () => {
  it("answers 401 UNAUTHENTICATED without a gsid cookie, with a garbage one, and with an unknown well-formed one", async () => {
    for (const headers of [undefined, { cookie: "gsid=garbage" }, { cookie: `gsid=${"a".repeat(43)}` }]) {
      const response = await harness.get("/api/guest/booking", headers);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: expect.any(String) } });
    }
  });

  it("answers 401 once the session has expired (event start plus one day)", async () => {
    const { token } = await harness.bookingWithLink();
    const cookie = await harness.sessionFor(token);
    harness.clock.set(new Date(EVENT_STARTS_AT.getTime() + MS_PER_DAY - 1));
    expect((await harness.get("/api/guest/booking", { cookie })).statusCode).toBe(200);

    harness.clock.set(new Date(EVENT_STARTS_AT.getTime() + MS_PER_DAY + 1));

    expect((await harness.get("/api/guest/booking", { cookie })).statusCode).toBe(401);
  });

  it("lets a session read only its own booking: session A never sees booking B", async () => {
    const a = await harness.bookingWithLink();
    const cookieA = await harness.sessionFor(a.token);
    const b = await harness.bookingWithLink();
    const cookieB = await harness.sessionFor(b.token);

    const seenByA = (await harness.get("/api/guest/booking", { cookie: cookieA })).json() as { bookingId: string };
    const seenByB = (await harness.get("/api/guest/booking", { cookie: cookieB })).json() as { bookingId: string };

    expect(seenByA.bookingId).toBe(a.bookingId);
    expect(seenByB.bookingId).toBe(b.bookingId);
    expect(JSON.stringify(seenByA)).not.toContain(b.ticketCode);
  });
});

describe("credential separation", () => {
  it("treats a request with only a gsid cookie as anonymous on user routes", async () => {
    const { token } = await harness.bookingWithLink();
    const cookie = await harness.sessionFor(token);

    const bookings = await harness.get("/api/me/bookings", { cookie });
    const me = await harness.get("/api/auth/me", { cookie });

    expect(bookings.statusCode).toBe(401);
    expect(me.json()).toEqual({ user: null });
  });

  it("does not accept a gsid token as a sid, nor a user session as a guest session", async () => {
    const { token } = await harness.bookingWithLink();
    const gsid = (await harness.sessionFor(token)).replace("gsid=", "");
    const disguised = await harness.get("/api/me/bookings", { cookie: `sid=${gsid}` });
    const user = await harness.auth().sessions.create(await insertUserId());

    const asGuest = await harness.get("/api/guest/booking", { cookie: `sid=${user.token}` });
    const asGuestWithGsid = await harness.get("/api/guest/booking", { cookie: `gsid=${user.token}` });

    expect(disguised.statusCode).toBe(401);
    expect(asGuest.statusCode).toBe(401);
    expect(asGuestWithGsid.statusCode).toBe(401);
  });
});

async function insertUserId(): Promise<string> {
  const [user] = await harness.prisma.client.$queryRaw<{ id: string }[]>`
    INSERT INTO users (email, created_at) VALUES (${`u-${Date.now()}@example.com`}, now()) RETURNING id`;
  return user?.id ?? "";
}
