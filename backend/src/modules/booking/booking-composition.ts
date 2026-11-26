import type { PrismaService } from "../../infrastructure/persistence/prisma-service.js";
import type { AppConfig } from "../../config/load-config.js";
import type { Clock } from "../../shared/time/clock.js";
import { HoldSeatService } from "./application/hold-seat-service.js";
import type { HoldRepository } from "./application/ports/hold-repository.js";
import { ExpireHoldsService } from "./application/expire-holds-service.js";
import { GetCurrentHoldQuery } from "./application/get-current-hold-query.js";
import { GetSeatMapQuery } from "./application/get-seat-map-query.js";
import { CheckoutService } from "./application/checkout-service.js";
import type { PaymentGateway } from "./application/ports/payment-gateway.js";
import { ReleaseSeatService } from "./application/release-seat-service.js";
import { PrismaCurrentHoldReader } from "./infrastructure/persistence/prisma-current-hold-reader.js";
import { PrismaHoldSweeper } from "./infrastructure/persistence/prisma-hold-sweeper.js";
import { PrismaSeatMapReader } from "./infrastructure/persistence/prisma-seat-map-reader.js";
import { MockPaymentGateway } from "./infrastructure/payment/mock-payment-gateway.js";
import { PrismaCheckoutRepository } from "./infrastructure/persistence/prisma-checkout-repository.js";
import { generateTicketCode } from "./domain/ticket-code.js";
import { PrismaHoldRepository } from "./infrastructure/persistence/prisma-hold-repository.js";

export interface BookingServices {
  readonly holdSeat: HoldSeatService;
  readonly releaseSeat: ReleaseSeatService;
  readonly getSeatMap: GetSeatMapQuery;
  readonly getCurrentHold: GetCurrentHoldQuery;
  readonly expireHolds: ExpireHoldsService;
  readonly checkout: CheckoutService;
}

export type BookingSettings = Pick<AppConfig, "holdDurationMinutes" | "maxSeatsPerHold">;

export function createPrismaHoldRepository(prisma: PrismaService): HoldRepository {
  return new PrismaHoldRepository(prisma);
}

/** Wires the booking use cases to the Prisma adapters, the clock and validated config values. */
export function createBookingServices(deps: BookingSettings & { readonly prisma: PrismaService; readonly clock: Clock; readonly paymentGateway?: PaymentGateway }): BookingServices {
  const holds = createPrismaHoldRepository(deps.prisma);
  const { clock, holdDurationMinutes, maxSeatsPerHold } = deps;
  return {
    holdSeat: new HoldSeatService({ holds, clock, holdDurationMinutes, maxSeatsPerHold }),
    releaseSeat: new ReleaseSeatService({ holds, clock }),
    getSeatMap: new GetSeatMapQuery({ reader: new PrismaSeatMapReader(deps.prisma), clock }),
    getCurrentHold: new GetCurrentHoldQuery({ holds: new PrismaCurrentHoldReader(deps.prisma), clock }),
    expireHolds: new ExpireHoldsService({ sweeper: new PrismaHoldSweeper(deps.prisma), clock }),
    checkout: new CheckoutService({
      checkout: new PrismaCheckoutRepository(deps.prisma, generateTicketCode),
      payments: deps.paymentGateway ?? new MockPaymentGateway(),
      clock,
    }),
  };
}
