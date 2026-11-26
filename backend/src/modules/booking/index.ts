// Public API of the booking module.
export { HoldSeatService, type HoldSeatDeps, type HoldSeatResult } from "./application/hold-seat-service.js";
export { ReleaseSeatService, type ReleaseSeatDeps } from "./application/release-seat-service.js";
export type { ActiveHold, HoldRepository, HoldTransaction } from "./application/ports/hold-repository.js";
export { PrismaHoldRepository } from "./infrastructure/persistence/prisma-hold-repository.js";
export { createBookingServices, createPrismaHoldRepository, type BookingServices, type BookingSettings } from "./booking-composition.js";
export * from "./domain/errors.js";
export { holderFrom, resolveHolder, type Holder, type HolderInput } from "./domain/holder.js";
