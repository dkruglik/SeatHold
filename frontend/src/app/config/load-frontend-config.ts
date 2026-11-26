export interface FrontendConfig {
  /** Where the API client sends requests: same-origin /api by default (one origin, no CORS). */
  readonly apiBaseUrl: string;
  /** How often the event page polls the public seat route, in milliseconds. */
  readonly seatPollIntervalMs: number;
}

/** The VITE_ variables the app reads. They are public in the bundle: never put a secret in one. */
export const frontendVariableNames = ["VITE_API_BASE_URL", "VITE_SEAT_POLL_INTERVAL_MS"] as const;

const defaultApiBaseUrl = "/api";
const defaultSeatPollIntervalMs = 3000;

/** Same origin only (one origin, no CORS): a path starting with a single slash, never an absolute or protocol-relative URL. */
function isApiBase(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

function loadApiBaseUrl(raw: unknown): string {
  if (raw === undefined || raw === "") {
    return defaultApiBaseUrl;
  }
  if (typeof raw !== "string" || !isApiBase(raw)) {
    throw new Error("Invalid configuration: VITE_API_BASE_URL must be a same-origin path starting with /");
  }
  return raw.replace(/\/+$/, "");
}

function loadSeatPollIntervalMs(raw: unknown): number {
  if (raw === undefined || raw === "") {
    return defaultSeatPollIntervalMs;
  }
  const value = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : 0;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Invalid configuration: VITE_SEAT_POLL_INTERVAL_MS must be a positive integer");
  }
  return value;
}

/** Pass `import.meta.env` from the entry point; tests pass plain objects. Names the variable, never its value. */
export function loadFrontendConfig(env: Readonly<Record<string, unknown>>): FrontendConfig {
  return Object.freeze({
    apiBaseUrl: loadApiBaseUrl(env.VITE_API_BASE_URL),
    seatPollIntervalMs: loadSeatPollIntervalMs(env.VITE_SEAT_POLL_INTERVAL_MS),
  });
}
