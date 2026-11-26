import { z } from "zod";

export const appEnvs = ["local", "production"] as const;
export const logLevels = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

export interface AppConfig {
  readonly appEnv: (typeof appEnvs)[number];
  readonly backendHost: string;
  readonly backendPort: number;
  readonly databaseUrl: string;
  readonly logLevel: (typeof logLevels)[number];
  readonly shutdownTimeoutMs: number;
  readonly frontendOrigin: string;
}

// What each variable must look like. Shown instead of zod's messages, which may quote the received value.
const requirements = {
  APP_ENV: "must be local or production",
  BACKEND_HOST: "must be a non-empty host name or address",
  BACKEND_PORT: "must be an integer from 1 to 65535",
  DATABASE_URL: "is required and must be a postgresql:// URL",
  LOG_LEVEL: `must be one of ${logLevels.join(", ")}`,
  SHUTDOWN_TIMEOUT_MS: "must be a positive integer",
  FRONTEND_ORIGIN: "must be an http(s) origin: scheme, host and optional port, no path (in production: set, https, not localhost)",
} as const;

export const configVariableNames = Object.keys(requirements) as ReadonlyArray<keyof typeof requirements>;

const positiveInteger = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));

const isHttpOrigin = (value: string): boolean => {
  const url = URL.parse(value);
  return url !== null && (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
};

const isPostgresUrl = (value: string): boolean => value.startsWith("postgresql://") && URL.canParse(value);

const envSchema = z.object({
  APP_ENV: z.enum(appEnvs).default("local"),
  BACKEND_HOST: z.string().min(1).default("0.0.0.0"),
  BACKEND_PORT: positiveInteger.pipe(z.number().max(65535)).default(3001),
  DATABASE_URL: z.string().refine(isPostgresUrl),
  LOG_LEVEL: z.enum(logLevels).default("info"),
  SHUTDOWN_TIMEOUT_MS: positiveInteger.default(10_000),
  FRONTEND_ORIGIN: z.string().refine(isHttpOrigin).optional(),
});

/** Thrown at startup for invalid configuration. Carries variable names and rules, never values (DATABASE_URL has a password). */
export class ConfigError extends Error {
  constructor(readonly variables: readonly string[]) {
    super(`Invalid configuration: ${variables.map((name) => `${name} ${describe(name)}`).join("; ")}`);
    this.name = "ConfigError";
  }
}

function describe(name: string): string {
  return name in requirements ? requirements[name as keyof typeof requirements] : "is invalid";
}

/** Production refuses local-only values: the origin must be explicit, https, and not a loopback host. */
function isProductionOrigin(value: string | undefined): boolean {
  const url = value === undefined ? null : URL.parse(value);
  return url !== null && url.protocol === "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

/** Reads, validates and converts the environment once. Pass `process.env` only from the entry point. */
export function loadConfig(env: Readonly<Record<string, string | undefined>> = process.env): AppConfig {
  const present = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined && value !== ""));
  const parsed = envSchema.safeParse(present);
  const invalid = new Set<string>(parsed.success ? [] : parsed.error.issues.map((issue) => String(issue.path[0])));
  const productionOrigin = !invalid.has("FRONTEND_ORIGIN") && present.APP_ENV === "production" && !isProductionOrigin(present.FRONTEND_ORIGIN);
  if (productionOrigin) {
    invalid.add("FRONTEND_ORIGIN");
  }
  if (!parsed.success || invalid.size > 0) {
    throw new ConfigError(configVariableNames.filter((name) => invalid.has(name)));
  }
  const values = parsed.data;
  return Object.freeze({
    appEnv: values.APP_ENV,
    backendHost: values.BACKEND_HOST,
    backendPort: values.BACKEND_PORT,
    databaseUrl: values.DATABASE_URL,
    logLevel: values.LOG_LEVEL,
    shutdownTimeoutMs: values.SHUTDOWN_TIMEOUT_MS,
    frontendOrigin: values.FRONTEND_ORIGIN ?? "http://localhost:5173",
  });
}
