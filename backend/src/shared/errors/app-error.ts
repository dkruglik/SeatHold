export type ErrorKind = "validation" | "authentication" | "authorization" | "business" | "not_found" | "payment_required" | "infrastructure";

/** Base of the errors the application distinguishes. Anything else is an unexpected error. */
export abstract class AppError extends Error {
  abstract readonly kind: ErrorKind;

  /** A stable machine-readable code for the HTTP body; the error handler falls back to the code of the kind. */
  readonly publicCode: string | undefined;

  constructor(message: string, options?: { cause?: unknown; publicCode?: string }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.publicCode = options?.publicCode;
  }
}

export class ValidationError extends AppError {
  readonly kind = "validation";
}

export class AuthenticationError extends AppError {
  readonly kind = "authentication";
}

export class AuthorizationError extends AppError {
  readonly kind = "authorization";
}

export class BusinessError extends AppError {
  readonly kind = "business";
}

/** The thing the request names does not exist (or is not the caller's to see): HTTP 404. */
export class NotFoundError extends AppError {
  readonly kind = "not_found";
}

/** A payment was attempted and not accepted: HTTP 402. */
export class PaymentRequiredError extends AppError {
  readonly kind = "payment_required";
}

export class InfrastructureError extends AppError {
  readonly kind = "infrastructure";
}
