export type ErrorKind = "validation" | "authentication" | "authorization" | "business" | "infrastructure";

/** Base of the errors the application distinguishes. Anything else is an unexpected error. */
export abstract class AppError extends Error {
  abstract readonly kind: ErrorKind;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
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
