import type { Writable } from "node:stream";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../../config/load-config.js";

// Fastify also logs responses it only knows the status of, so getHeaders may be missing.
type LoggedReply = Partial<FastifyReply> & Pick<FastifyReply, "statusCode">;

/** Pino paths whose values never reach a log line (DECISIONS.md, log redaction). */
export const redactedPaths = ['req.headers.cookie', 'req.headers["x-csrf-token"]', 'req.headers.authorization', 'res.headers["set-cookie"]'];

/**
 * JSON logs on stdout. The serializers add headers to the request and response entries so that
 * redaction has something to redact and diagnostics keep them. Request bodies are never logged.
 */
export function buildLoggerOptions(config: Pick<AppConfig, "logLevel">, stream?: Writable) {
  return {
    level: config.logLevel,
    redact: { paths: redactedPaths, censor: "[Redacted]" },
    serializers: {
      req: (request: FastifyRequest) => ({
        method: request.method,
        url: request.url,
        host: request.host,
        remoteAddress: request.ip,
        headers: request.headers,
      }),
      res: (reply: LoggedReply) => ({ statusCode: reply.statusCode, headers: reply.getHeaders?.() }),
    },
    ...(stream === undefined ? {} : { stream }),
  };
}
