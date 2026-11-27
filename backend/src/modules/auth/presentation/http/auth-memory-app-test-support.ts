import type { FastifyInstance } from "fastify";
import { buildApp } from "../../../../app.js";
import type { AppConfig } from "../../../../config/load-config.js";
import { ControlledClock } from "../../../../shared/time/controlled-clock.js";
import { createAuthServices } from "../../auth-composition.js";
import {
  InMemoryLoginCodeRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  RecordingEmailProvider,
} from "../../application/in-memory-auth-test-support.js";

export interface MemoryAuthApp {
  readonly app: FastifyInstance;
  readonly email: RecordingEmailProvider;
}

/** The real app over in-memory repositories: route tests that need no database. */
export function buildMemoryAuthApp(config: AppConfig, clock = new ControlledClock(new Date("2030-01-01T10:00:00.000Z"))): MemoryAuthApp {
  const users = new InMemoryUserRepository();
  const email = new RecordingEmailProvider();
  const services = createAuthServices(config, { clock, email, users, codes: new InMemoryLoginCodeRepository(), sessions: new InMemorySessionRepository(users) });
  return { app: buildApp(config, { clock, auth: { services } }), email };
}

export interface CsrfCredentials {
  readonly token: string;
  /** The `cookie` header value that carries the CSRF secret. */
  readonly cookie: string;
}

/** What a browser holds after `GET /api/auth/csrf`. */
export async function fetchCsrf(app: FastifyInstance): Promise<CsrfCredentials> {
  const response = await app.inject({ method: "GET", url: "/api/auth/csrf" });
  const set = response.cookies.find((cookie) => cookie.name === "csrf_secret");
  return { token: (response.json() as { csrfToken: string }).csrfToken, cookie: `csrf_secret=${set?.value ?? ""}` };
}
