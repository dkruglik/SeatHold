import { createHash, randomBytes } from "node:crypto";

export const VISITOR_COOKIE = "vid";

const SECONDS_PER_DAY = 86_400;
const VISITOR_COOKIE_DAYS = 30;
export const VISITOR_COOKIE_MAX_AGE_SECONDS = VISITOR_COOKIE_DAYS * SECONDS_PER_DAY;

const TOKEN_BYTES = 32;
// 32 bytes in base64url without padding are exactly 43 characters.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/** A random 256-bit visitor token. The raw value lives only in the cookie. */
export const generateVisitorToken = (): string => randomBytes(TOKEN_BYTES).toString("base64url");

export const isVisitorToken = (value: unknown): value is string => typeof value === "string" && TOKEN_SHAPE.test(value);

/** What is stored as `visitor_hash`: SHA-256 hex of the token. A fast hash is enough, the token is random and 256 bits long. */
export const hashVisitorToken = (token: string): string => createHash("sha256").update(token).digest("hex");
