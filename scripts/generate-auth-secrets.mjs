import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Minimum length required by backend config for AUTH_CODE_PEPPER, CSRF_SECRET, LEGAL_EVIDENCE_HMAC_KEY, and ABUSE_HMAC_KEY. */
export const AUTH_SECRET_MIN_LENGTH = 32;

const DEFAULT_BYTE_LENGTH = 32;

/**
 * @param {number} [byteLength]
 * @returns {string}
 */
export function generateAuthSecret(byteLength = DEFAULT_BYTE_LENGTH) {
  const value = randomBytes(byteLength).toString("base64url");
  if (value.length < AUTH_SECRET_MIN_LENGTH) {
    throw new Error(
      `generated secret length ${value.length} is below minimum ${AUTH_SECRET_MIN_LENGTH}`,
    );
  }
  return value;
}

function runCli() {
  console.log("# Paste into .env.local and .env.docker.local (use different values; do not commit):\n");
  console.log(`AUTH_CODE_PEPPER=${generateAuthSecret()}`);
  console.log(`CSRF_SECRET=${generateAuthSecret()}`);
  console.log(`LEGAL_EVIDENCE_HMAC_KEY=${generateAuthSecret()}`);
  console.log(`ABUSE_HMAC_KEY=${generateAuthSecret()}`);
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  runCli();
}
