export interface FrontendConfig {
  /** Where the API client sends requests: same-origin /api by default (one origin, no CORS). */
  readonly apiBaseUrl: string;
}

/** The VITE_ variables the app reads. They are public in the bundle: never put a secret in one. */
export const frontendVariableNames = ["VITE_API_BASE_URL"] as const;

const defaultApiBaseUrl = "/api";

/** Same origin only (one origin, no CORS): a path starting with a single slash, never an absolute or protocol-relative URL. */
function isApiBase(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

/** Pass `import.meta.env` from the entry point; tests pass plain objects. Names the variable, never its value. */
export function loadFrontendConfig(env: Readonly<Record<string, unknown>>): FrontendConfig {
  const raw = env.VITE_API_BASE_URL;
  if (raw === undefined || raw === "") {
    return Object.freeze({ apiBaseUrl: defaultApiBaseUrl });
  }
  if (typeof raw !== "string" || !isApiBase(raw)) {
    throw new Error("Invalid configuration: VITE_API_BASE_URL must be a same-origin path starting with /");
  }
  return Object.freeze({ apiBaseUrl: raw.replace(/\/+$/, "") });
}
