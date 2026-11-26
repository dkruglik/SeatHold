import { describe, expect, it } from "vitest";
import { testConfig } from "./modules/auth/presentation/http/auth-route-test-support.js";
import type { EmailMessage, EmailProvider } from "./modules/auth/index.js";
import { insertSeatedEvent, insertUser, T0, useBookingPool, visitor } from "./modules/booking/infrastructure/persistence/booking-test-support.js";
import { holderFrom } from "./modules/booking/domain/holder.js";
import { PaymentFailed } from "./modules/booking/domain/errors.js";
import { LinkUsed } from "./modules/guest-access/index.js";
import type { WarnLogger } from "./shared/logging/warn-logger.js";
import { ControlledClock } from "./shared/time/controlled-clock.js";
import { createBookingWithGuestAccess } from "./booking-with-guest-access.js";

const prisma = useBookingPool();

class MailBox implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  fail = false;
  send(message: EmailMessage): Promise<void> {
    if (this.fail) return Promise.reject(new Error("smtp down"));
    this.sent.push(message);
    return Promise.resolve();
  }
}

async function setup() {
  await prisma.client.$executeRawUnsafe("TRUNCATE TABLE guest_access_links, guest_sessions, guest_resend_attempts CASCADE");
  const mail = new MailBox();
  const warnings: string[] = [];
  const logger: WarnLogger = { warn: (message, fields) => { warnings.push(JSON.stringify({ message, fields })); } };
  const clock = new ControlledClock(T0);
  const wired = createBookingWithGuestAccess(testConfig(), { prisma, clock, email: mail, logger });
  const event = await insertSeatedEvent(prisma, 3);
  return { ...wired, mail, warnings, ...event };
}

const count = async (table: string): Promise<number> => (await prisma.client.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${table}`))[0]?.n ?? 0;

describe("guest checkout issues the access link", () => {
  it("a confirmed guest checkout stores exactly one link row and sends exactly one email", async () => {
    const { booking, mail, eventId, seatIds } = await setup();
    await booking.holdSeat.hold({ holder: visitor(1), eventId, seatId: seatIds[0] as string });

    const result = await booking.checkout.checkout({ holder: visitor(1), eventId, paymentOutcome: "succeed", guestEmail: "fan@example.com" });

    expect(result.status).toBe("confirmed");
    expect(await count("guest_access_links")).toBe(1);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.to).toBe("fan@example.com");
    expect(mail.sent[0]?.text).toMatch(/http:\/\/localhost:5173\/guest\/access#t=[A-Za-z0-9_-]{43}/);
  });

  it("a signed-in checkout issues no link and sends no email", async () => {
    const { booking, mail, eventId, seatIds } = await setup();
    const userId = await insertUser(prisma, "u@example.com");
    const holder = holderFrom({ userId });
    await booking.holdSeat.hold({ holder, eventId, seatId: seatIds[0] as string });

    await booking.checkout.checkout({ holder, eventId, paymentOutcome: "succeed" });

    expect(await count("guest_access_links")).toBe(0);
    expect(mail.sent).toEqual([]);
  });

  it("a failed payment issues no link and sends no email", async () => {
    const { booking, mail, eventId, seatIds } = await setup();
    await booking.holdSeat.hold({ holder: visitor(1), eventId, seatId: seatIds[0] as string });

    const error = await booking.checkout.checkout({ holder: visitor(1), eventId, paymentOutcome: "fail", guestEmail: "fan@example.com" }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PaymentFailed);
    expect(await count("guest_access_links")).toBe(0);
    expect(mail.sent).toEqual([]);
  });

  it("an email provider that throws still yields a confirmed booking, and a redacted warning", async () => {
    const { booking, mail, warnings, eventId, seatIds } = await setup();
    mail.fail = true;
    await booking.holdSeat.hold({ holder: visitor(1), eventId, seatId: seatIds[0] as string });

    const result = await booking.checkout.checkout({ holder: visitor(1), eventId, paymentOutcome: "succeed", guestEmail: "fan@example.com" });

    expect(result.status).toBe("confirmed");
    expect(await count("bookings")).toBe(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(result.id);
    expect(warnings[0]).not.toContain("fan@example.com");
    expect(warnings[0]).not.toContain("#t=");
  });
});

describe("guest link exchange against PostgreSQL", () => {
  it("a concurrent double exchange of one token produces exactly one session", async () => {
    const { booking, guestAccess, mail, eventId, seatIds } = await setup();
    await booking.holdSeat.hold({ holder: visitor(1), eventId, seatId: seatIds[0] as string });
    await booking.checkout.checkout({ holder: visitor(1), eventId, paymentOutcome: "succeed", guestEmail: "fan@example.com" });
    const token = /#t=([A-Za-z0-9_-]+)/.exec(mail.sent[0]?.text ?? "")?.[1] ?? "";

    const results = await Promise.allSettled(Array.from({ length: 10 }, () => guestAccess.exchange.exchange({ token })));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(LinkUsed);
    expect(await count("guest_sessions")).toBe(1);
  });

  it("resend after exchange revokes the session and invalidates links through the real repositories", async () => {
    const { booking, guestAccess, mail, eventId, seatIds } = await setup();
    await booking.holdSeat.hold({ holder: visitor(1), eventId, seatId: seatIds[0] as string });
    const made = await booking.checkout.checkout({ holder: visitor(1), eventId, paymentOutcome: "succeed", guestEmail: "Fan@Example.com" });
    const first = await guestAccess.exchange.exchange({ token: /#t=([A-Za-z0-9_-]+)/.exec(mail.sent[0]?.text ?? "")?.[1] ?? "" });
    expect((await guestAccess.getBooking.get({ sessionToken: first.sessionToken })).bookingId).toBe(made.id);

    const result = await guestAccess.resend.resend({ email: "fan@example.com" });

    expect(result).toEqual({ kind: "accepted" });
    expect(mail.sent).toHaveLength(2);
    await expect(guestAccess.getBooking.get({ sessionToken: first.sessionToken })).rejects.toThrow();
    const fresh = /#t=([A-Za-z0-9_-]+)/.exec(mail.sent[1]?.text ?? "")?.[1] ?? "";
    expect((await guestAccess.exchange.exchange({ token: fresh })).booking.bookingId).toBe(made.id);
  });
});
