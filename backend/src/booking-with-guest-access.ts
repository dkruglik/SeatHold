import type { AppConfig } from "./config/load-config.js";
import type { PrismaService } from "./infrastructure/persistence/prisma-service.js";
import type { EmailProvider } from "./modules/auth/index.js";
import { createBookingServices, type BookingServices } from "./modules/booking/index.js";
import type { PaymentGateway } from "./modules/booking/index.js";
import { createGuestAccessRepositories, createGuestAccessServices, type GuestAccessServices } from "./modules/guest-access/index.js";
import type { WarnLogger } from "./shared/logging/warn-logger.js";
import type { Clock } from "./shared/time/clock.js";

export interface BookingWithGuestAccess {
  readonly booking: BookingServices;
  readonly guestAccess: GuestAccessServices;
}

/**
 * The composition root for the two modules that need each other: booking's checkout calls guest access through its own
 * `GuestLinkIssuer` port, and guest access reads bookings through booking's public query. Neither imports the other's
 * internals; the late-bound issuer below closes the loop without an import cycle.
 */
export function createBookingWithGuestAccess(
  config: AppConfig,
  deps: { readonly prisma: PrismaService; readonly clock: Clock; readonly email: EmailProvider; readonly logger: WarnLogger; readonly paymentGateway?: PaymentGateway },
): BookingWithGuestAccess {
  const { prisma, clock, email, logger } = deps;
  const late: { guestAccess?: GuestAccessServices } = {};
  const booking = createBookingServices({
    prisma, clock, logger, holdDurationMinutes: config.holdDurationMinutes, maxSeatsPerHold: config.maxSeatsPerHold,
    ...(deps.paymentGateway === undefined ? {} : { paymentGateway: deps.paymentGateway }),
    guestLinkIssuer: { issue: (input) => (late.guestAccess as GuestAccessServices).issue.issue(input) },
  });
  const guestAccess = createGuestAccessServices(config, { ...createGuestAccessRepositories(prisma), clock, email, logger, bookings: booking.guestBookings });
  late.guestAccess = guestAccess;
  return { booking, guestAccess };
}
