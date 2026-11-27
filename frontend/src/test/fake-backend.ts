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
  /** `/auth/me` answers 500 this many times, then works. */
  readonly meFailures?: number;
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

function read(state: State, options: FakeBackendOptions, rawPath: string, meCalls: number): Response {
  const { user } = state;
  const path = rawPath.split("?")[0] ?? rawPath;
  if (path === "/auth/csrf") {
    return json({ csrfToken: state.token });
  }
  if (path === "/auth/me") {
    if (meCalls <= (options.meFailures ?? 0)) {
      return failure(500, "INTERNAL");
    }
    return json({ user });
  }
  if (path === "/shows") {
    return json({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
  }
  if (path === "/shows/facets") {
    return json({ types: [], genres: [], countries: [], cities: [], venues: [] });
  }
  if (path === "/admin/events" || path === "/admin/lookups") {
    if (user === null) {
      return failure(401, "UNAUTHENTICATED");
    }
    if (user.role !== "admin") {
      return failure(403, "FORBIDDEN_ROLE");
    }
    return json(path === "/admin/lookups" ? { shows: [], venues: [] } : { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 });
  }
  return failure(404, "not_found");
}

/** An in-memory stand-in for the backend contract of /api/auth, /api/admin and an empty public catalog (/api/shows): mutations without the current token get 403 CSRF_INVALID. */
export function createFakeBackend(options: FakeBackendOptions = {}): FakeBackend {
  const state: State = { user: options.user ?? null, token: "token-1" };
  let rotations = 0;
  let meCalls = 0;
  const calls: RecordedCall[] = [];

  const fetchImpl: typeof fetch = (input, init) => {
    const path = String(input).replace(/^\/api/, "");
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    if (path === "/auth/me") {
      meCalls += 1;
    }
    calls.push({ method, path, csrfToken: headers.get("x-csrf-token"), credentials: init?.credentials, body });
    if (method !== "GET" && headers.get("x-csrf-token") !== state.token) {
      return Promise.resolve(failure(403, "CSRF_INVALID"));
    }
    return Promise.resolve(method === "GET" ? read(state, options, path, meCalls) : mutate(state, options, path, (body ?? {}) as Record<string, unknown>));
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
