import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach } from "vitest";
import { buildApp } from "../../../../app.js";
import type { AppConfig } from "../../../../config/load-config.js";
import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import { ControlledClock } from "../../../../shared/time/controlled-clock.js";
import { ConsoleEmailProvider } from "../../../auth/infrastructure/email/console-email-provider.js";
import { createAuthServices, createPrismaAuthRepositories, type AuthServices } from "../../../auth/index.js";
import { fetchCsrf } from "../../../auth/presentation/http/auth-memory-app-test-support.js";
import { testConfig } from "../../../auth/presentation/http/auth-route-test-support.js";
import { createBookingServices, type BookingServices } from "../../booking-composition.js";
import { T0, insertUser, useBookingPool } from "../../infrastructure/persistence/booking-test-support.js";
import { VISITOR_COOKIE, hashVisitorToken } from "./hooks/visitor-token.js";

export const visitorToken = (n: number): string => `${String(n).padStart(43, "v")}`;
export const visitorHashOf = (n: number): string => hashVisitorToken(visitorToken(n));
export const vidCookie = (n: number): Record<string, string> => ({ cookie: `${VISITOR_COOKIE}=${visitorToken(n)}` });

export interface BookingHarness {
  readonly prisma: PrismaService;
  readonly clock: ControlledClock;
  readonly booking: () => BookingServices;
  readonly app: () => FastifyInstance;
  readonly get: (url: string, headers?: Record<string, string>) => Promise<LightMyRequestResponse>;
  /** A browser-like mutation: carries a CSRF token with its cookie and the frontend Origin. Passed headers win; `cookie` values are merged. */
  readonly mutate: (method: "PUT" | "DELETE", url: string, headers?: Record<string, string>) => Promise<LightMyRequestResponse>;
  /** A user with a live session: its id and the `cookie` header that carries the session. */
  readonly signedInUser: (email: string) => Promise<{ userId: string; headers: Record<string, string> }>;
}

/** The real app over Prisma repositories on the throwaway database, with auth and booking services and a controlled clock. */
export function useBookingApp(configOverrides: Partial<AppConfig> = {}): BookingHarness {
  const prisma = useBookingPool();
  const clock = new ControlledClock(T0);
  let current: FastifyInstance | undefined;
  let auth: AuthServices | undefined;
  let booking: BookingServices | undefined;

  beforeEach(async () => {
    clock.set(T0);
    const config = testConfig(configOverrides);
    auth = createAuthServices(config, { clock, email: new ConsoleEmailProvider(() => undefined), ...createPrismaAuthRepositories(prisma) });
    booking = createBookingServices({ prisma, clock, holdDurationMinutes: config.holdDurationMinutes, maxSeatsPerHold: config.maxSeatsPerHold });
    current = buildApp(config, { clock, auth: { services: auth }, booking: { services: booking } });
    await current.ready();
  });
  afterEach(() => current?.close());

  const app = (): FastifyInstance => {
    if (current === undefined) throw new Error("app is built in beforeEach");
    return current;
  };
  const get: BookingHarness["get"] = (url, headers) => app().inject({ method: "GET", url, ...(headers === undefined ? {} : { headers }) });
  const mutate: BookingHarness["mutate"] = async (method, url, headers) => {
    const csrf = await fetchCsrf(app());
    const cookie = [csrf.cookie, headers?.cookie].filter((value) => value !== undefined).join("; ");
    return app().inject({ method, url, headers: { origin: testConfig().frontendOrigin, "x-csrf-token": csrf.token, ...headers, cookie } });
  };
  const signedInUser: BookingHarness["signedInUser"] = async (email) => {
    const userId = await insertUser(prisma, email);
    const { token } = await (auth as AuthServices).sessions.create(userId);
    return { userId, headers: { cookie: `sid=${token}` } };
  };
  return { prisma, clock, booking: () => booking as BookingServices, app, get, mutate, signedInUser };
}
