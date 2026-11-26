import type { PrismaService } from "../../infrastructure/persistence/prisma-service.js";
import type { AppConfig } from "../../config/load-config.js";
import type { Clock } from "../../shared/time/clock.js";
import { HoldSeatService } from "./application/hold-seat-service.js";
import type { HoldRepository } from "./application/ports/hold-repository.js";
import { ReleaseSeatService } from "./application/release-seat-service.js";
import { PrismaHoldRepository } from "./infrastructure/persistence/prisma-hold-repository.js";

export interface BookingServices {
  readonly holdSeat: HoldSeatService;
  readonly releaseSeat: ReleaseSeatService;
}

export type BookingSettings = Pick<AppConfig, "holdDurationMinutes" | "maxSeatsPerHold">;

export function createPrismaHoldRepository(prisma: PrismaService): HoldRepository {
  return new PrismaHoldRepository(prisma);
}

/** Wires the booking use cases to the Prisma adapters, the clock and validated config values. */
export function createBookingServices(deps: BookingSettings & { readonly prisma: PrismaService; readonly clock: Clock }): BookingServices {
  const holds = createPrismaHoldRepository(deps.prisma);
  const { clock, holdDurationMinutes, maxSeatsPerHold } = deps;
  return {
    holdSeat: new HoldSeatService({ holds, clock, holdDurationMinutes, maxSeatsPerHold }),
    releaseSeat: new ReleaseSeatService({ holds, clock }),
  };
}
