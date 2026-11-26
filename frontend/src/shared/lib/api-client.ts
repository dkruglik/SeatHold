import type { FrontendConfig } from "../../app/config/load-frontend-config";

/** The server answered with a non-2xx status (or a 2xx body that is not JSON). Carries no response body text. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, code?: string) {
    super(`API request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** No response arrived (offline, DNS, connection reset, blocked request). */
export class ApiNetworkError extends Error {
  constructor(options?: ErrorOptions) {
    super("API request could not reach the server", options);
    this.name = "ApiNetworkError";
  }
}

async function readErrorCode(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json();
    const code = typeof body === "object" && body !== null ? (body as { code?: unknown }).code : undefined;
    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The only place the app calls the backend. Read-only for now: state-changing methods arrive in Phase 1 together
 * with the CSRF token header (`X-CSRF-Token`, rule 42), so no mutation can be sent without it.
 */
export class ApiClient {
  constructor(
    private readonly config: Pick<FrontendConfig, "apiBaseUrl">,
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  async get<T>(path: string): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw new TypeError("API path must start with a single /");
    }
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.apiBaseUrl}${path}`, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
    } catch (cause) {
      throw new ApiNetworkError({ cause });
    }
    if (!response.ok) {
      throw new ApiError(response.status, await readErrorCode(response));
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
