export interface FakeUser {
  readonly id: string;
  readonly email: string;
  readonly role: "buyer" | "admin";
}

export interface FakeBackendOptions {
  readonly user?: FakeUser | null;
  readonly validCode?: string;
  readonly roleOnLogin?: "buyer" | "admin";
  readonly rateLimitedForSeconds?: number;
}

export interface RecordedCall {
  readonly method: string;
  readonly path: string;
  readonly csrfToken: string | null;
  readonly credentials: RequestCredentials | undefined;
  readonly body: unknown;
}

export interface FakeBackend {
  readonly fetchImpl: typeof fetch;
  readonly calls: RecordedCall[];
  rotateToken(): void;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const failure = (status: number, code: string) => json({ error: { code, message: code } }, status);

interface State {
  user: FakeUser | null;
  token: string;
}

function mutate(state: State, options: FakeBackendOptions, path: string, body: Record<string, unknown>): Response {
  if (path === "/auth/request-code") {
    const wait = options.rateLimitedForSeconds;
    return wait === undefined
      ? new Response(null, { status: 204 })
      : json({ error: { code: "RATE_LIMITED", message: "slow down" }, retryAfterSeconds: wait }, 429);
  }
  if (path === "/auth/verify") {
    if (body.code !== (options.validCode ?? "123456")) {
      return failure(400, "INVALID_CODE");
    }
    state.user = { id: "user-1", email: String(body.email), role: options.roleOnLogin ?? "buyer" };
    return json({ user: state.user });
  }
  if (path === "/auth/logout" || path === "/auth/logout-all") {
    state.user = null;
    return new Response(null, { status: 204 });
  }
  return failure(404, "not_found");
}

function read(state: State, path: string): Response {
  const { user } = state;
  if (path === "/auth/csrf") {
    return json({ csrfToken: state.token });
  }
  if (path === "/auth/me") {
    return json({ user });
  }
  if (path === "/admin/ping") {
    return user === null ? failure(401, "UNAUTHENTICATED") : user.role === "admin" ? json({ ok: true }) : failure(403, "FORBIDDEN_ROLE");
  }
  return failure(404, "not_found");
}

/** An in-memory stand-in for the backend contract of /api/auth and /api/admin: mutations without the current token get 403 CSRF_INVALID. */
export function createFakeBackend(options: FakeBackendOptions = {}): FakeBackend {
  const state: State = { user: options.user ?? null, token: "token-1" };
  let rotations = 0;
  const calls: RecordedCall[] = [];

  const fetchImpl: typeof fetch = (input, init) => {
    const path = String(input).replace(/^\/api/, "");
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, csrfToken: headers.get("x-csrf-token"), credentials: init?.credentials, body });
    if (method !== "GET" && headers.get("x-csrf-token") !== state.token) {
      return Promise.resolve(failure(403, "CSRF_INVALID"));
    }
    return Promise.resolve(method === "GET" ? read(state, path) : mutate(state, options, path, (body ?? {}) as Record<string, unknown>));
  };

  return {
    fetchImpl,
    calls,
    rotateToken: () => {
      rotations += 1;
      state.token = `rotated-${rotations}`;
    },
  };
}
