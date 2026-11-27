export type ErrorKind = "validation" | "authentication" | "authorization" | "business" | "infrastructure";

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

export class InfrastructureError extends AppError {
  readonly kind = "infrastructure";
}
