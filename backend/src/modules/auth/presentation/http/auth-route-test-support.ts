import { createHash } from "node:crypto";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach } from "vitest";
import { buildApp } from "../../../../app.js";
import type { AppConfig } from "../../../../config/load-config.js";
import type { PrismaService } from "../../../../infrastructure/persistence/prisma-service.js";
import { ControlledClock } from "../../../../shared/time/controlled-clock.js";
import { ConsoleEmailProvider } from "../../infrastructure/email/console-email-provider.js";
import { createAuthServices, createPrismaAuthRepositories } from "../../auth-composition.js";
import { useAuthDatabase } from "../../infrastructure/persistence/auth-test-support.js";

export const T0 = new Date("2030-01-01T10:00:00.000Z");
export const MS_PER_DAY = 86_400_000;

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    appEnv: "local",
    backendHost: "127.0.0.1",
    backendPort: 3001,
    databaseUrl: "postgresql://unused:unused@127.0.0.1:1/unused",
    databasePoolMax: 2,
    logLevel: "silent",
    shutdownTimeoutMs: 1000,
    frontendOrigin: "http://localhost:5173",
    emailProvider: "console",
    emailFrom: "no-reply@seathold.local",
    smtpHost: "localhost",
    smtpPort: 1025,
    authCodePepper: "route-test-pepper-0123456789-abcdefghij",
    authRequestCodeLimit: 5,
    authRequestCodeWindowMinutes: 15,
    authRequestCodeCooldownSeconds: 60,
    cookieSecure: false,
    sessionTtlDays: 30,
    ...overrides,
  };
}

export interface AuthHarness {
  readonly prisma: PrismaService;
  readonly clock: ControlledClock;
  readonly app: () => FastifyInstance;
  /** Requests a code for the email and returns the six digits read from the captured console email. */
  readonly codeFor: (email: string) => Promise<string>;
  /** Full login: request a code, wait out the cooldown, verify. */
  readonly login: (email: string, headers?: Record<string, string>) => Promise<LightMyRequestResponse>;
  readonly post: (url: string, payload?: object, headers?: Record<string, string>) => Promise<LightMyRequestResponse>;
  readonly get: (url: string, headers?: Record<string, string>) => Promise<LightMyRequestResponse>;
}

/** The value of the `sid` cookie a response sets. */
export function sidOf(response: LightMyRequestResponse): string {
  return response.cookies.find((cookie) => cookie.name === "sid")?.value ?? "";
}

export const cookieHeader = (sid: string): Record<string, string> => ({ cookie: `sid=${sid}` });

export const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

/** An app over the real Prisma repositories on the throwaway database, a controlled clock and a console email whose lines are captured. */
export function useAuthApp(overrides: Partial<AppConfig> = {}): AuthHarness {
  const prisma = useAuthDatabase();
  const clock = new ControlledClock(T0);
  const lines: string[] = [];
  let current: FastifyInstance | undefined;

  beforeEach(async () => {
    clock.set(T0);
    lines.length = 0;
    const config = testConfig(overrides);
    const services = createAuthServices(config, {
      clock,
      email: new ConsoleEmailProvider((line) => lines.push(line)),
      ...createPrismaAuthRepositories(prisma),
    });
    current = buildApp(config, { clock, auth: { services } });
    await current.ready();
  });
  afterEach(() => current?.close());

  const app = (): FastifyInstance => {
    if (current === undefined) throw new Error("app is built in beforeEach");
    return current;
  };
  const post: AuthHarness["post"] = (url, payload, headers) => app().inject({ method: "POST", url, ...(payload === undefined ? {} : { payload }), ...(headers === undefined ? {} : { headers }) });
  const get: AuthHarness["get"] = (url, headers) => app().inject({ method: "GET", url, ...(headers === undefined ? {} : { headers }) });
  const codeFor = async (email: string): Promise<string> => {
    await post("/api/auth/request-code", { email });
    return /\b(\d{6})\b/.exec(lines.at(-1) ?? "")?.[1] ?? "";
  };
  const login: AuthHarness["login"] = async (email, headers) => {
    clock.advance(61_000);
    return post("/api/auth/verify", { email, code: await codeFor(email) }, headers);
  };
  return { prisma, clock, app, codeFor, login, post, get };
}
