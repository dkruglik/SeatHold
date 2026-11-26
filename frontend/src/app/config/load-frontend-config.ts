export interface FrontendConfig {
  /** Where the API client sends requests: same-origin /api by default (one origin, no CORS). */
  readonly apiBaseUrl: string;
}

/** The VITE_ variables the app reads. They are public in the bundle: never put a secret in one. */
export const frontendVariableNames = ["VITE_API_BASE_URL"] as const;

const defaultApiBaseUrl = "/api";

function isApiBase(value: string): boolean {
  if (value.startsWith("/")) {
    return !value.startsWith("//");
  }
  const url = URL.parse(value);
  return url !== null && (url.protocol === "http:" || url.protocol === "https:");
}

/** Pass `import.meta.env` from the entry point; tests pass plain objects. Names the variable, never its value. */
export function loadFrontendConfig(env: Readonly<Record<string, unknown>>): FrontendConfig {
  const raw = env.VITE_API_BASE_URL;
  if (raw === undefined || raw === "") {
    return Object.freeze({ apiBaseUrl: defaultApiBaseUrl });
  }
  if (typeof raw !== "string" || !isApiBase(raw)) {
    throw new Error("Invalid configuration: VITE_API_BASE_URL must be a path starting with / or an http(s) URL");
  }
  return Object.freeze({ apiBaseUrl: raw.replace(/\/+$/, "") });
}
