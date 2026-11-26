import { describe, expect, it } from "vitest";
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  BusinessError,
  InfrastructureError,
  NotFoundError,
  PaymentRequiredError,
  ValidationError,
} from "./app-error.js";

describe("application errors", () => {
  it.each([
    [ValidationError, "validation"],
    [AuthenticationError, "authentication"],
    [AuthorizationError, "authorization"],
    [BusinessError, "business"],
    [NotFoundError, "not_found"],
    [PaymentRequiredError, "payment_required"],
    [InfrastructureError, "infrastructure"],
  ] as const)("%o is an AppError with kind %s", (ErrorClass, kind) => {
    const error = new ErrorClass("boom");

    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe(kind);
    expect(error.message).toBe("boom");
  });

  it("keeps the cause so diagnostics are not lost", () => {
    const cause = new Error("connection refused");

    expect(new InfrastructureError("database unavailable", { cause }).cause).toBe(cause);
  });
});
