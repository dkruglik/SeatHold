/**
 * Where application code reports a handled problem. Callers pass ids only: never tokens, links or email addresses
 * (rule 13: redacted logs). The runtime adapts the app's logger to this port.
 */
export interface WarnLogger {
  warn(message: string, fields?: Record<string, unknown>): void;
}
