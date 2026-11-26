const fallback = "/";

/** Only a same-origin path that starts with a single `/` is a valid return target; anything else (and the login page itself) becomes `/`. */
export function safeRedirectPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  // eslint-disable-next-line no-control-regex
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }
  return /^\/login(?:[/?#]|$)/.test(value) ? fallback : value;
}
