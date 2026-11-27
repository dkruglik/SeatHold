import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { PrismaUserRepository } from "../../modules/auth/index.js";
import { seedEvent } from "../../modules/backoffice/presentation/http/admin-read-test-support.js";
import {
  cookieHeader,
  sidOf,
  useAuthApp,
  type AuthHarness,
  type RegisteredRoute,
} from "../../modules/auth/presentation/http/auth-route-test-support.js";

const ADMIN_PREFIX = "/api/admin";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const isAdminRoute = (route: RegisteredRoute): boolean => route.url === ADMIN_PREFIX || route.url.startsWith(`${ADMIN_PREFIX}/`);
// Fastify registers HEAD next to GET; the access rule is the same, so GET stands for both.
const adminRoutes = (harness: AuthHarness): RegisteredRoute[] => harness.routes.filter((route) => isAdminRoute(route) && route.method !== "HEAD");

/** The body a route needs to reach its handler, so the admin answer is a 2xx. Routes not listed take an empty body. */
const SAMPLE_BODIES: Readonly<Record<string, object>> = {
  "POST /api/admin/events": {
    show: { new: { title: "Access check", type: "concert", genre: "rock", description: "d" } },
    venue: { new: { name: "Access hall", city: "Berlin", countryCode: "DE", timezone: "Europe/Berlin" } },
    startsAt: "2030-06-01T18:00:00.000Z",
    priceMinor: 1000,
    currency: "EUR",
    rows: 2,
    seatsPerRow: 3,
  },
};

/** A route's path with its parameters filled in: `:eventId` names an event that exists, so the admin answer is a 2xx rather than 404. */
const withParams = (url: string, eventId: string): string => url.replace(":eventId", eventId);

interface Credentials {
  readonly sid: string;
}

/** One request as a browser would send it: mutating methods carry valid CSRF credentials so only the role decides. */
async function call(harness: AuthHarness, route: RegisteredRoute, who: Credentials | null, eventId: string): Promise<{ status: number; code: string | undefined }> {
  const headers = who === null ? {} : cookieHeader(who.sid);
  const url = withParams(route.url, eventId);
  const response = SAFE_METHODS.has(route.method)
    ? await harness.get(url, headers)
    : await harness.post(url, SAMPLE_BODIES[`${route.method} ${route.url}`] ?? {}, headers);
  const body = response.json() as { error?: { code?: string } };
  return { status: response.statusCode, code: body.error?.code };
}

/** The routes under /api/admin that do not answer anonymous 401, buyer 403 FORBIDDEN_ROLE and admin 2xx. Empty means the boundary holds. */
async function accessViolations(harness: AuthHarness, buyer: Credentials, admin: Credentials): Promise<string[]> {
  const violations: string[] = [];
  const { eventId } = await seedEvent(harness.prisma, { seats: [["A", 1]] });
  for (const route of adminRoutes(harness)) {
    const anonymous = await call(harness, route, null, eventId);
    const asBuyer = await call(harness, route, buyer, eventId);
    const asAdmin = await call(harness, route, admin, eventId);
    if (anonymous.status !== 401 || anonymous.code !== "UNAUTHENTICATED") violations.push(`${route.method} ${route.url} anonymous -> ${anonymous.status}`);
    if (asBuyer.status !== 403 || asBuyer.code !== "FORBIDDEN_ROLE") violations.push(`${route.method} ${route.url} buyer -> ${asBuyer.status}`);
    if (asAdmin.status < 200 || asAdmin.status > 299) violations.push(`${route.method} ${route.url} admin -> ${asAdmin.status}`);
  }
  return violations;
}

async function sessions(harness: AuthHarness): Promise<{ buyer: Credentials; admin: Credentials }> {
  const buyer = sidOf(await harness.login("ada@example.io"));
  const admin = sidOf(await harness.login("root@example.io"));
  await new PrismaUserRepository(harness.prisma).setRoleByEmail("root@example.io", "admin");
  return { buyer: { sid: buyer }, admin: { sid: admin } };
}

describe("every route under /api/admin (the real app)", () => {
  const harness = useAuthApp();

  it("covers every back-office route: all of them are registered under /api/admin", () => {
    expect(adminRoutes(harness).map((route) => `${route.method} ${route.url}`).sort()).toEqual([
      "GET /api/admin/events",
      "GET /api/admin/events/:eventId/bought-tickets",
      "GET /api/admin/events/:eventId/open-tickets",
      "GET /api/admin/lookups",
      "POST /api/admin/events",
    ]);
  });

  it("answers anonymous 401 UNAUTHENTICATED, buyer 403 FORBIDDEN_ROLE and admin 2xx", async () => {
    const { buyer, admin } = await sessions(harness);

    expect(await accessViolations(harness, buyer, admin)).toEqual([]);
    expect((await harness.get("/api/admin/lookups", cookieHeader(admin.sid))).json()).toMatchObject({ shows: expect.any(Array), venues: expect.any(Array) });
  });

  it("takes a demotion into effect on the next request of the same session", async () => {
    const { admin } = await sessions(harness);
    expect((await harness.get("/api/admin/lookups", cookieHeader(admin.sid))).statusCode).toBe(200);

    await new PrismaUserRepository(harness.prisma).setRoleByEmail("root@example.io", "buyer");

    const after = await harness.get("/api/admin/lookups", cookieHeader(admin.sid));
    expect(after.statusCode).toBe(403);
    expect(after.json()).toEqual({ error: { code: "FORBIDDEN_ROLE", message: expect.any(String) } });
  });

  it("takes a promotion into effect on the next request of the same session", async () => {
    const { buyer } = await sessions(harness);
    expect((await harness.get("/api/admin/lookups", cookieHeader(buyer.sid))).statusCode).toBe(403);

    await new PrismaUserRepository(harness.prisma).setRoleByEmail("ada@example.io", "admin");

    expect((await harness.get("/api/admin/lookups", cookieHeader(buyer.sid))).statusCode).toBe(200);
  });
});

describe("an admin route registered outside the plugin", () => {
  const stray = (app: FastifyInstance): void => {
    void app.register(async (scope) => {
      scope.get("/api/admin/stray", () => ({ unguarded: true }));
    });
  };
  const harness = useAuthApp({}, stray);

  it("is reported by the route-wide check", async () => {
    const { buyer, admin } = await sessions(harness);

    const violations = await accessViolations(harness, buyer, admin);

    expect(violations).toEqual(["GET /api/admin/stray anonymous -> 200", "GET /api/admin/stray buyer -> 200"]);
  });
});

describe("roles over HTTP", () => {
  const harness = useAuthApp();

  it("has no route that takes a role: no registered path names one", () => {
    expect(harness.routes.filter((route) => /role/i.test(route.url))).toEqual([]);
  });

  it("creates a buyer when verify carries a role in the body", async () => {
    const response = await harness.login("mallory@example.io");
    expect(response.statusCode).toBeLessThan(300);
    const me = await harness.get("/api/auth/me", cookieHeader(sidOf(response)));
    expect(me.json()).toMatchObject({ user: { email: "mallory@example.io", role: "buyer" } });
  });
});
