import type { FastifyInstance, RouteOptions } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildMemoryAuthApp, fetchCsrf } from "../../modules/auth/presentation/http/auth-memory-app-test-support.js";
import type { BackofficeServices } from "../../modules/backoffice/index.js";
import type { BookingServices } from "../../modules/booking/index.js";
import type { GuestAccessServices } from "../../modules/guest-access/index.js";
import { testConfig } from "../../modules/auth/presentation/http/auth-route-test-support.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ORIGIN = "http://localhost:5173";

interface RegisteredRoute {
  readonly method: string;
  readonly url: string;
}

let app: FastifyInstance;

afterEach(() => app.close());

/** Every route the real app registers, collected before it starts. Future modules are covered as soon as buildApp registers them. */
async function registeredRoutes(): Promise<{ app: FastifyInstance; routes: RegisteredRoute[] }> {
  // Booking and guest-access services are never reached: the mutation hooks reject first, so stubs stand in for the database-backed ones.
  ({ app } = buildMemoryAuthApp(testConfig(), undefined, { booking: { services: {} as BookingServices }, guestAccess: { services: {} as GuestAccessServices }, backoffice: { services: {} as BackofficeServices } }));
  const routes: RegisteredRoute[] = [];
  app.addHook("onRoute", (route: RouteOptions) => {
    for (const method of [route.method].flat()) {
      routes.push({ method, url: route.url });
    }
  });
  await app.ready();
  return { app, routes };
}

describe("every state-changing route", () => {
  it("is covered by this test (the app registers mutating routes at all)", async () => {
    const { routes } = await registeredRoutes();

    const mutating = routes.filter((route) => !SAFE_METHODS.has(route.method));

    expect(mutating.map((route) => `${route.method} ${route.url}`).sort()).toEqual(
      expect.arrayContaining(["POST /api/auth/request-code", "POST /api/auth/verify", "POST /api/auth/logout", "POST /api/auth/logout-all", "PUT /api/events/:eventId/hold/seats/:seatId", "DELETE /api/events/:eventId/hold/seats/:seatId", "POST /api/events/:eventId/hold/checkout", "POST /api/guest/exchange", "POST /api/guest/resend", "POST /api/admin/events"]),
    );
  });

  it("rejects a request without a CSRF token with 403 CSRF_INVALID, and one with a foreign Origin with 403 ORIGIN_INVALID", async () => {
    const { routes } = await registeredRoutes();
    const { cookie, token } = await fetchCsrf(app);
    const mutating = routes.filter((route) => !SAFE_METHODS.has(route.method));

    expect(mutating.length).toBeGreaterThan(0);
    for (const route of mutating) {
      const method = route.method as "POST" | "PUT" | "PATCH" | "DELETE";
      const withoutToken = await app.inject({ method, url: route.url, headers: { origin: ORIGIN, cookie } });
      const foreignOrigin = await app.inject({ method, url: route.url, headers: { origin: "http://evil.example", cookie, "x-csrf-token": token } });

      expect([route.method, route.url, withoutToken.statusCode, withoutToken.json()]).toEqual([
        route.method,
        route.url,
        403,
        { error: { code: "CSRF_INVALID", message: expect.any(String) } },
      ]);
      expect([route.method, route.url, foreignOrigin.statusCode, foreignOrigin.json()]).toEqual([
        route.method,
        route.url,
        403,
        { error: { code: "ORIGIN_INVALID", message: expect.any(String) } },
      ]);
    }
  });
});
