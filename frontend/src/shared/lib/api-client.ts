import type { FrontendConfig } from "../../app/config/load-frontend-config";

/** The server answered with a non-2xx status (or a 2xx body that is not JSON). Carries no response body text. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly retryAfterSeconds: number | undefined;

  constructor(status: number, code?: string, retryAfterSeconds?: number) {
    super(`API request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** No response arrived (offline, DNS, connection reset, blocked request). */
export class ApiNetworkError extends Error {
  constructor(options?: ErrorOptions) {
    super("API request could not reach the server", options);
    this.name = "ApiNetworkError";
  }
}

type Mutation = "POST" | "PUT" | "DELETE";

const csrfPath = "/auth/csrf";
const csrfInvalidCode = "CSRF_INVALID";

async function failureOf(response: Response): Promise<ApiError> {
  let code: string | undefined;
  let retryAfterSeconds: number | undefined;
  try {
    const body = (await response.json()) as { error?: { code?: unknown }; retryAfterSeconds?: unknown } | null;
    code = typeof body?.error?.code === "string" ? body.error.code : undefined;
    retryAfterSeconds = typeof body?.retryAfterSeconds === "number" ? body.retryAfterSeconds : undefined;
  } catch {
    // a body that is not JSON carries no code
  }
  return new ApiError(response.status, code, retryAfterSeconds);
}

function assertApiPath(path: string): void {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new TypeError("API path must start with a single /");
  }
}

/**
 * The only place the app calls the backend. Every state-changing request goes through `post`, which sends the CSRF
 * token (`X-CSRF-Token`, rule 42) from the one `send` path, so a mutation cannot leave without it. The token lives in
 * this instance's memory only: never in web storage, never logged.
 */
export class ApiClient {
  private csrfToken: Promise<string> | undefined;

  constructor(
    private readonly config: Pick<FrontendConfig, "apiBaseUrl">,
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  get<T>(path: string): Promise<T> {
    return this.send<T>("GET", path, undefined, undefined);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.mutate<T>("POST", path, body);
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.mutate<T>("PUT", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.mutate<T>("DELETE", path, undefined);
  }

  /** The token is fetched first and cached. One 403 CSRF_INVALID (cookie or secret rotated) refetches it and retries once. */
  private async mutate<T>(method: Mutation, path: string, body: unknown): Promise<T> {
    assertApiPath(path);
    try {
      return await this.send<T>(method, path, body, await this.token());
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 403 || error.code !== csrfInvalidCode) {
        throw error;
      }
      this.csrfToken = undefined;
      return this.send<T>(method, path, body, await this.token());
    }
  }

  private token(): Promise<string> {
    if (this.csrfToken === undefined) {
      const pending = this.get<{ csrfToken?: unknown }>(csrfPath).then((result) => {
        if (typeof result?.csrfToken !== "string") {
          throw new ApiError(200);
        }
        return result.csrfToken;
      });
      this.csrfToken = pending;
      pending.catch(() => {
        if (this.csrfToken === pending) {
          this.csrfToken = undefined;
        }
      });
    }
    return this.csrfToken;
  }

  private async send<T>(method: "GET" | Mutation, path: string, body: unknown, csrfToken: string | undefined): Promise<T> {
    assertApiPath(path);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (method !== "GET") {
      headers["X-CSRF-Token"] = csrfToken ?? "";
      // Fastify rejects an empty body when this header says the body is JSON (logout, logout-all).
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
      }
    }
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.apiBaseUrl}${path}`, {
        method,
        credentials: "include",
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (cause) {
      throw new ApiNetworkError({ cause });
    }
    if (!response.ok) {
      throw await failureOf(response);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError(response.status);
    }
  }
}
