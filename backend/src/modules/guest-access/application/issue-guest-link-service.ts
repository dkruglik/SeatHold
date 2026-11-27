import { InfrastructureError } from "../../../shared/errors/app-error.js";
import type { WarnLogger } from "../../../shared/logging/warn-logger.js";
import type { Clock } from "../../../shared/time/clock.js";
import type { EmailProvider } from "../../auth/index.js";
import { guestLinkEmail } from "./guest-link-email.js";
import type { GuestLinkRepository } from "./ports/guest-link-repository.js";
import type { GuestTokens } from "./ports/guest-tokens.js";

export interface IssueGuestLinkDeps {
  readonly clock: Clock;
  readonly links: GuestLinkRepository;
  readonly email: EmailProvider;
  readonly tokens: GuestTokens;
  readonly logger: WarnLogger;
  /** The frontend origin from config; the link is built on it. */
  readonly frontendOrigin: string;
  readonly linkTtlHours: number;
}

export interface IssueGuestLinkInput {
  readonly bookingId: string;
  readonly email: string;
  readonly eventStartsAt: Date;
  readonly eventTitle: string;
}

const MS_PER_HOUR = 3_600_000;

/**
 * Stores the hash of a new one-time token and emails the link `<origin>/guest/access#t=<token>` (a fragment, so the token
 * stays out of server logs and Referer). A send failure never fails the caller: the booking is already confirmed and the
 * buyer can request a new link, so it is logged with the booking id only and the undelivered link is invalidated.
 */
export class IssueGuestLinkService {
  constructor(private readonly deps: IssueGuestLinkDeps) {}

  async issue(input: IssueGuestLinkInput): Promise<void> {
    const { clock, links, email, tokens, logger, frontendOrigin, linkTtlHours } = this.deps;
    const now = await clock.now();
    const token = tokens.generate();
    await links.create({ bookingId: input.bookingId, tokenHash: tokens.hash(token), expiresAt: new Date(now.getTime() + linkTtlHours * MS_PER_HOUR), now });
    const message = guestLinkEmail({
      to: input.email, eventTitle: input.eventTitle, eventStartsAt: input.eventStartsAt, link: `${frontendOrigin}/guest/access#t=${token}`, ttlHours: linkTtlHours,
    });
    try {
      await email.send(message);
    } catch (error) {
      logger.warn("guest link email was not sent; the buyer can request a new link", { bookingId: input.bookingId, ...errorFields(error) });
      await this.invalidateUndelivered(input.bookingId, now);
    }
  }

  /** The stored link was never delivered, so it must not stay usable. A failure here is logged and never thrown. */
  private async invalidateUndelivered(bookingId: string, now: Date): Promise<void> {
    try {
      await this.deps.links.invalidateUnusedForBookings([bookingId], now);
    } catch (error) {
      this.deps.logger.warn("undelivered guest link could not be invalidated", { bookingId, ...errorFields(error) });
    }
  }
}

const errorName = (error: unknown): string => (error instanceof Error ? error.name : "unknown");

/**
 * Two message shapes end in a short code: the SMTP adapter's "Email delivery failed (ECONNREFUSED)" and the database
 * wrapper's "Persistence failed: <operation> (57P01)". The whole message must match; only the code is logged, never the text.
 */
const SAFE_FAILURES = [/^Email delivery failed \(([A-Z0-9_]{1,32})\)$/, /^Persistence failed: [^()]+ \(([A-Z0-9]{2,8})\)$/];

function errorFields(error: unknown): { errorName: string; errorCode?: string } {
  const code = error instanceof InfrastructureError ? SAFE_FAILURES.map((pattern) => pattern.exec(error.message)?.[1]).find((c) => c !== undefined) : undefined;
  return code === undefined ? { errorName: errorName(error) } : { errorName: errorName(error), errorCode: code };
}
