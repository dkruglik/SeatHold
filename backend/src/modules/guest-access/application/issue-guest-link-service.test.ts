import { describe, expect, it } from "vitest";
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

  it("does not throw when sending fails, keeps the link row, and logs only the booking id", async () => {
    const { issue, email, logger, links } = setup();
    email.fail = true;

    await expect(issue.issue(input)).resolves.toBeUndefined();

    expect(links.rows).toHaveLength(1);
    expect(logger.lines).toHaveLength(1);
    expect(logger.lines[0]?.fields).toMatchObject({ bookingId: "b1" });
    expect(logger.text()).not.toContain("example.com");
    expect(logger.text()).not.toContain("#t=");
  });
});
