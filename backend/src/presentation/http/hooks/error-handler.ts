import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppError, type ErrorKind } from "../../../shared/errors/app-error.js";

interface ErrorBody {
  readonly error: { readonly code: string; readonly message: string };
}

const internal = { status: 500, code: "internal_error", message: "Internal server error" } as const;

// Kinds whose message is written for the client. An infrastructure error is internal: its message may carry connection details.
const clientKinds: Readonly<Record<Exclude<ErrorKind, "infrastructure">, { status: number; code: string }>> = {
  validation: { status: 400, code: "validation_error" },
  authentication: { status: 401, code: "authentication_required" },
  authorization: { status: 403, code: "forbidden" },
  business: { status: 409, code: "business_rule_violation" },
  not_found: { status: 404, code: "not_found" },
  payment_required: { status: 402, code: "payment_required" },
};

function body(code: string, message: string): ErrorBody {
  return { error: { code, message } };
}

/** Status and fixed text for Fastify's own 4xx errors (malformed JSON, schema validation, body limit). Its messages can quote input, so they are not sent. */
function fastifyClientError(error: FastifyError): { status: number; code: string; message: string } | undefined {
  const status = error.statusCode;
  if (status === undefined || status < 400 || status > 499) {
    return undefined;
  }
  return status === 413
    ? { status, code: "payload_too_large", message: "Payload too large" }
    : { status, code: "invalid_request", message: "Invalid request" };
}

function handle(error: FastifyError | AppError, request: FastifyRequest, reply: FastifyReply): ErrorBody {
  if (error instanceof AppError && error.kind !== "infrastructure") {
    const { status, code } = clientKinds[error.kind];
    void reply.code(status);
    return body(error.publicCode ?? code, error.message);
  }
  const clientError = error instanceof AppError ? undefined : fastifyClientError(error as FastifyError);
  if (clientError !== undefined) {
    void reply.code(clientError.status);
    return body(clientError.code, clientError.message);
  }
  request.log.error({ req: request, err: error }, "request failed");
  void reply.code(internal.status);
  return body(internal.code, internal.message);
}

/**
 * Registers the app-wide error handler: every error leaves as `{ "error": { "code", "message" } }`.
 * Application errors map to 400, 401, 402, 403, 404 and 409; Fastify's request errors to 400 or 413 with fixed text;
 * everything else is a 500 with a generic message, and the real error is logged once.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError, request, reply) => reply.send(handle(error, request, reply)));
}
