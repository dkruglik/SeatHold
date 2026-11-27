import { describe, expect, it } from "vitest";
import { InfrastructureError } from "../../../shared/errors/app-error.js";
import { ORIGIN, setup, tokenIn } from "./guest-access-fixtures.test-support.js";
import { EVENT_START, HOUR, T0 } from "./in-memory-guest-access.test-support.js";

const input = { bookingId: "b1", email: "Guest@Example.com", eventStartsAt: EVENT_START, eventTitle: "Rock Night" };

describe("IssueGuestLinkService", () => {
  it("stores only the hash, expires after the configured hours, and sends one email with a fragment link on the frontend origin", async () => {
    const { issue, links, email, tokens } = setup();

    await issue.issue(input);

    expect(email.sent).toHaveLength(1);
    const message = email.sent[0];
    const token = tokenIn(message?.text ?? "");
    expect(token).toHaveLength(43);
    expect(message?.to).toBe("Guest@Example.com");
    expect(message?.text).toContain(`${ORIGIN}/guest/access#t=${token}`);
    expect(message?.text).toContain("Rock Night");
    expect(message?.text).not.toContain("?t=");
    expect(links.rows).toHaveLength(1);
    expect(links.rows[0]).toMatchObject({ bookingId: "b1", tokenHash: tokens.hash(token), expiresAt: new Date(T0.getTime() + 168 * HOUR) });
    expect(JSON.stringify(links.rows)).not.toContain(token);
  });

  it("does not throw when sending fails, invalidates the undelivered link, and logs only the booking id", async () => {
    const { issue, email, logger, links } = setup();
    email.fail = true;

    await expect(issue.issue(input)).resolves.toBeUndefined();

    expect(links.rows).toHaveLength(1);
    expect(links.rows[0]?.invalidatedAt).toEqual(T0);
    expect(logger.lines).toHaveLength(1);
    expect(logger.lines[0]?.fields).toMatchObject({ bookingId: "b1" });
    expect(logger.text()).not.toContain("example.com");
    expect(logger.text()).not.toContain("#t=");
  });

  it("still does not throw when invalidating the undelivered link fails too, and logs the booking id only", async () => {
    const { issue, email, logger, links } = setup();
    email.fail = true;
    links.invalidateUnusedForBookings = () => Promise.reject(new Error("db down for g@example.com"));

    await expect(issue.issue(input)).resolves.toBeUndefined();

    expect(logger.lines).toHaveLength(2);
    expect(logger.lines.every((l) => l.fields?.bookingId === "b1")).toBe(true);
    expect(logger.text()).not.toContain("example.com");
  });
});

describe("IssueGuestLinkService failure log", () => {
  it("logs the adapter's safe error code with the booking id, never the address or the token", async () => {
    const { issue, email, logger } = setup();
    email.send = () => Promise.reject(new InfrastructureError("Email delivery failed (ECONNREFUSED)"));

    await issue.issue(input);

    expect(logger.lines[0]?.fields).toEqual({ bookingId: "b1", errorName: "InfrastructureError", errorCode: "ECONNREFUSED" });
    expect(logger.text()).not.toContain("example.com");
    expect(logger.text()).not.toContain("#t=");
  });

  it("logs no error code when the failure carries none or its message is not the adapter's shape", async () => {
    const { issue, email, logger } = setup();
    email.fail = true;

    await issue.issue(input);
    email.send = () => Promise.reject(new InfrastructureError("Email delivery failed (bad code, guest@example.com)"));
    await issue.issue(input);

    expect(logger.lines).toHaveLength(2);
    for (const line of logger.lines) expect(line.fields).not.toHaveProperty("errorCode");
    expect(logger.text()).not.toContain("example.com");
  });
});
