import { z } from "zod";

export const appEnvs = ["local", "production"] as const;
export const emailProviders = ["console", "smtp"] as const;
export const logLevels = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

export interface AppConfig {
  readonly appEnv: (typeof appEnvs)[number];
  readonly backendHost: string;
  readonly backendPort: number;
  readonly databaseUrl: string;
  readonly databasePoolMax: number;
  readonly logLevel: (typeof logLevels)[number];
  readonly shutdownTimeoutMs: number;
  readonly frontendOrigin: string;
  readonly emailProvider: (typeof emailProviders)[number];
  readonly emailFrom: string;
  readonly smtpHost: string;
  readonly smtpPort: number;
  readonly smtpUser?: string;
  /** Secret: never log or print. */
  readonly smtpPass?: string;
  /** Secret: the HMAC key for login codes. Never log or print. */
  readonly authCodePepper: string;
  /** Secret: signs the cookie that holds the CSRF secret (DECISIONS.md O46). Never log or print. */
  readonly csrfSecret: string;
  readonly authRequestCodeLimit: number;
  readonly authRequestCodeWindowMinutes: number;
  readonly authRequestCodeCooldownSeconds: number;
  /** The session cookie carries the Secure attribute. Required true in production (DECISIONS.md O44). */
  readonly cookieSecure: boolean;
  readonly sessionTtlDays: number;
  /** How long a seat hold lasts, in minutes. */
  readonly holdDurationMinutes: number;
  /** The most seats one hold may contain. */
  readonly maxSeatsPerHold: number;
  /** ISO 4217 code used when a show does not set its own currency. */
  readonly defaultCurrency: string;
  /** How long a guest access link stays valid, in hours. */
  readonly guestLinkTtlHours: number;
  /** The most guest access link resends per booking in the resend window. */
  readonly guestResendLimit: number;
  /** The resend window, in minutes. */
  readonly guestResendWindowMinutes: number;
}

/** The value `.env.example` carries for local development. Production refuses it (DECISIONS.md O42). */
export const localPepperPlaceholder = "local-only-pepper-replace-in-production-0000";

/** The value `.env.example` carries for the CSRF secret. Production refuses it (DECISIONS.md O46). */
export const localCsrfSecretPlaceholder = "local-only-csrf-secret-replace-in-production-0000";

// What each variable must look like. Shown instead of zod's messages, which may quote the received value.
const requirements = {
  APP_ENV: "must be local or production",
  BACKEND_HOST: "must be a non-empty host name or address",
  BACKEND_PORT: "must be an integer from 1 to 65535",
  DATABASE_URL: "is required and must be a postgresql:// URL",
  DATABASE_POOL_MAX: "must be an integer from 1 to 100",
  LOG_LEVEL: `must be one of ${logLevels.join(", ")}`,
  SHUTDOWN_TIMEOUT_MS: "must be a positive integer",
  FRONTEND_ORIGIN: "must be an http(s) origin: scheme, host and optional port, no path (in production: set, https, not localhost)",
  EMAIL_PROVIDER: "must be smtp or console (console is refused in production)",
  EMAIL_FROM: "must be an email address such as no-reply@example.com",
  SMTP_HOST: "must be a non-empty host name or address",
  SMTP_PORT: "must be an integer from 1 to 65535",
  SMTP_USER: "must be set together with SMTP_PASS",
  SMTP_PASS: "must be set together with SMTP_USER",
  AUTH_CODE_PEPPER: "is required and must be a secret of at least 32 characters (in production, not the local placeholder)",
  CSRF_SECRET: "is required and must be a secret of at least 32 characters (in production, not the local placeholder)",
  AUTH_REQUEST_CODE_LIMIT: "must be a positive integer",
  AUTH_REQUEST_CODE_WINDOW_MINUTES: "must be a positive integer",
  AUTH_REQUEST_CODE_COOLDOWN_SECONDS: "must be a positive integer",
  COOKIE_SECURE: "must be true or false (in production it must be true)",
  SESSION_TTL_DAYS: "must be a positive integer",
  HOLD_DURATION_MINUTES: "must be a positive integer",
  MAX_SEATS_PER_HOLD: "must be a positive integer",
  DEFAULT_CURRENCY: "must be a 3-letter uppercase currency code such as EUR",
  GUEST_LINK_TTL_HOURS: "must be a positive integer",
  GUEST_RESEND_LIMIT: "must be a positive integer",
  GUEST_RESEND_WINDOW_MINUTES: "must be a positive integer",
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

const isEmailAddress = (value: string): boolean => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);

const envSchema = z.object({
  APP_ENV: z.enum(appEnvs).default("local"),
  BACKEND_HOST: z.string().min(1).default("0.0.0.0"),
  BACKEND_PORT: positiveInteger.pipe(z.number().max(65535)).default(3001),
  DATABASE_URL: z.string().refine(isPostgresUrl),
  DATABASE_POOL_MAX: positiveInteger.pipe(z.number().max(100)).default(10),
  LOG_LEVEL: z.enum(logLevels).default("info"),
  SHUTDOWN_TIMEOUT_MS: positiveInteger.default(10_000),
  FRONTEND_ORIGIN: z.string().refine(isHttpOrigin).optional(),
  EMAIL_PROVIDER: z.enum(emailProviders).default("smtp"),
  EMAIL_FROM: z.string().refine(isEmailAddress).default("no-reply@seathold.local"),
  SMTP_HOST: z.string().min(1).default("localhost"),
  SMTP_PORT: positiveInteger.pipe(z.number().max(65535)).default(1025),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  AUTH_CODE_PEPPER: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  AUTH_REQUEST_CODE_LIMIT: positiveInteger.default(5),
  AUTH_REQUEST_CODE_WINDOW_MINUTES: positiveInteger.default(15),
  AUTH_REQUEST_CODE_COOLDOWN_SECONDS: positiveInteger.default(60),
  COOKIE_SECURE: z.enum(["true", "false"]).transform((value) => value === "true").default(false),
  SESSION_TTL_DAYS: positiveInteger.default(30),
  HOLD_DURATION_MINUTES: positiveInteger.default(10),
  MAX_SEATS_PER_HOLD: positiveInteger.default(10),
  DEFAULT_CURRENCY: z.string().regex(/^[A-Z]{3}$/).default("EUR"),
  GUEST_LINK_TTL_HOURS: positiveInteger.default(168),
  GUEST_RESEND_LIMIT: positiveInteger.default(3),
  GUEST_RESEND_WINDOW_MINUTES: positiveInteger.default(60),
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

/** In production the local placeholders of the secrets are refused (DECISIONS.md O42, O46). */
function productionRefusedPlaceholders(present: Readonly<Record<string, string | undefined>>): string[] {
  if (present.APP_ENV !== "production") {
    return [];
  }
  return [
    ...(present.AUTH_CODE_PEPPER === localPepperPlaceholder ? ["AUTH_CODE_PEPPER"] : []),
    ...(present.CSRF_SECRET === localCsrfSecretPlaceholder ? ["CSRF_SECRET"] : []),
  ];
}

function toConfig(values: z.output<typeof envSchema>): AppConfig {
  return Object.freeze({
    appEnv: values.APP_ENV,
    backendHost: values.BACKEND_HOST,
    backendPort: values.BACKEND_PORT,
    databaseUrl: values.DATABASE_URL,
    databasePoolMax: values.DATABASE_POOL_MAX,
    logLevel: values.LOG_LEVEL,
    shutdownTimeoutMs: values.SHUTDOWN_TIMEOUT_MS,
    frontendOrigin: values.FRONTEND_ORIGIN ?? "http://localhost:5173",
    emailProvider: values.EMAIL_PROVIDER,
    emailFrom: values.EMAIL_FROM,
    smtpHost: values.SMTP_HOST,
    smtpPort: values.SMTP_PORT,
    authCodePepper: values.AUTH_CODE_PEPPER,
    csrfSecret: values.CSRF_SECRET,
    authRequestCodeLimit: values.AUTH_REQUEST_CODE_LIMIT,
    authRequestCodeWindowMinutes: values.AUTH_REQUEST_CODE_WINDOW_MINUTES,
    authRequestCodeCooldownSeconds: values.AUTH_REQUEST_CODE_COOLDOWN_SECONDS,
    cookieSecure: values.COOKIE_SECURE,
    sessionTtlDays: values.SESSION_TTL_DAYS,
    holdDurationMinutes: values.HOLD_DURATION_MINUTES,
    maxSeatsPerHold: values.MAX_SEATS_PER_HOLD,
    defaultCurrency: values.DEFAULT_CURRENCY,
    guestLinkTtlHours: values.GUEST_LINK_TTL_HOURS,
    guestResendLimit: values.GUEST_RESEND_LIMIT,
    guestResendWindowMinutes: values.GUEST_RESEND_WINDOW_MINUTES,
    ...(values.SMTP_USER === undefined ? {} : { smtpUser: values.SMTP_USER }),
    ...(values.SMTP_PASS === undefined ? {} : { smtpPass: values.SMTP_PASS }),
  });
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
  if (present.APP_ENV === "production" && present.EMAIL_PROVIDER === "console") {
    invalid.add("EMAIL_PROVIDER");
  }
  for (const name of productionRefusedPlaceholders(present)) {
    invalid.add(name);
  }
  if (present.APP_ENV === "production" && present.COOKIE_SECURE !== "true") {
    invalid.add("COOKIE_SECURE");
  }
  // An empty currency is a mistake, not "unset": it must not fall back to the default.
  if (env.DEFAULT_CURRENCY === "") {
    invalid.add("DEFAULT_CURRENCY");
  }
  // Credentials come as a pair; the missing half is named.
  if ((present.SMTP_USER === undefined) !== (present.SMTP_PASS === undefined)) {
    invalid.add(present.SMTP_USER === undefined ? "SMTP_USER" : "SMTP_PASS");
  }
  if (!parsed.success || invalid.size > 0) {
    throw new ConfigError(configVariableNames.filter((name) => invalid.has(name)));
  }
  return toConfig(parsed.data);
}
