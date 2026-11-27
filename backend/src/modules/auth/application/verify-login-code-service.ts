import { ValidationError } from "../../../shared/errors/app-error.js";
import type { Clock } from "../../../shared/time/clock.js";
import { isValidEmail, normalizeEmail } from "../domain/email.js";
import { MAX_LOGIN_CODE_ATTEMPTS } from "../domain/login-code.js";
import type { User } from "../domain/user.js";
import type { LoginCodeHasher } from "./ports/login-code-hasher.js";
import type { LoginCodeRepository } from "./ports/login-code-repository.js";
import type { UserRepository } from "./ports/user-repository.js";

export interface VerifyLoginCodeInput {
  readonly email: string;
  readonly code: string;
}

/** Every failure is the same value, so nothing tells a wrong code from an expired, used up or missing one. */
export type VerifyLoginCodeResult = { readonly kind: "verified"; readonly user: User } | { readonly kind: "invalid_code" };

export interface VerifyLoginCodeDeps {
  readonly clock: Clock;
  readonly codes: LoginCodeRepository;
  readonly hasher: LoginCodeHasher;
  readonly users: UserRepository;
}

/** Checks a login code and, when it is right, consumes it and finds or creates the buyer. Sessions are a separate service. */
export class VerifyLoginCodeService {
  constructor(private readonly deps: VerifyLoginCodeDeps) {}

  async execute(input: VerifyLoginCodeInput): Promise<VerifyLoginCodeResult> {
    if (!isValidEmail(input.email)) {
      throw new ValidationError("A valid email address is required");
    }
    const email = normalizeEmail(input.email);
    const now = await this.deps.clock.now();

    const stored = await this.deps.codes.findLatestValid(email, now);
    if (stored === null || stored.attempts >= MAX_LOGIN_CODE_ATTEMPTS) {
      return { kind: "invalid_code" };
    }
    if (!this.deps.hasher.matches(input.code, stored.codeHash)) {
      await this.deps.codes.incrementAttempts(stored.id);
      return { kind: "invalid_code" };
    }
    // One conditional update: of two concurrent verifies of the same code, only one gets true.
    if (!(await this.deps.codes.consume(stored.id, now))) {
      return { kind: "invalid_code" };
    }
    const user = (await this.deps.users.findByEmail(email)) ?? (await this.deps.users.createBuyer(email, now));
    return { kind: "verified", user };
  }
}
