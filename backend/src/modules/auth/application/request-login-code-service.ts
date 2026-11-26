import { InfrastructureError, ValidationError } from "../../../shared/errors/app-error.js";
import type { Clock } from "../../../shared/time/clock.js";
import { isValidEmail, normalizeEmail } from "../domain/email.js";
import { LOGIN_CODE_TTL_MINUTES } from "../domain/login-code.js";
import { loginCodeEmail } from "./login-code-email.js";
import type { EmailProvider } from "./ports/email-provider.js";
import type { LoginCodeGenerator } from "./ports/login-code-generator.js";
import type { LoginCodeHasher } from "./ports/login-code-hasher.js";
import type { LoginCodeRepository } from "./ports/login-code-repository.js";

export interface RequestLoginCodeLimits {
  /** Requests allowed per email inside the window. */
  readonly limit: number;
  readonly windowMinutes: number;
  /** Minimum time between two requests for one email. */
  readonly cooldownSeconds: number;
}

export interface RequestLoginCodeInput {
  readonly email: string;
}

export type RequestLoginCodeResult = { readonly kind: "sent" } | { readonly kind: "rate_limited"; readonly retryAfterSeconds: number };

export interface RequestLoginCodeDeps {
  readonly clock: Clock;
  readonly codes: LoginCodeRepository;
  readonly email: EmailProvider;
  readonly generator: LoginCodeGenerator;
  readonly hasher: LoginCodeHasher;
  readonly limits: RequestLoginCodeLimits;
}

const MS_PER_MINUTE = 60_000;

/**
 * Issues a login code by email. The rate limit counts rows in auth_codes, so it holds across instances,
 * and it never looks at accounts: a known and an unknown address get the same answer (DECISIONS.md O43).
 */
export class RequestLoginCodeService {
  constructor(private readonly deps: RequestLoginCodeDeps) {}

  async execute(input: RequestLoginCodeInput): Promise<RequestLoginCodeResult> {
    if (!isValidEmail(input.email)) {
      throw new ValidationError("A valid email address is required");
    }
    const email = normalizeEmail(input.email);
    const now = await this.deps.clock.now();

    const waitMs = await this.waitMilliseconds(email, now);
    if (waitMs > 0) {
      return { kind: "rate_limited", retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
    }

    await this.deps.codes.invalidateUnused(email, now);
    const code = this.deps.generator.generate();
    await this.deps.codes.create({
      email,
      codeHash: this.deps.hasher.hash(code),
      expiresAt: new Date(now.getTime() + LOGIN_CODE_TTL_MINUTES * MS_PER_MINUTE),
      now,
    });
    await this.send(email, code);
    return { kind: "sent" };
  }

  /** Milliseconds until the next request is allowed; 0 or less when it is allowed now. */
  private async waitMilliseconds(email: string, now: Date): Promise<number> {
    const { limit, windowMinutes, cooldownSeconds } = this.deps.limits;
    const windowMs = windowMinutes * MS_PER_MINUTE;
    const windowStart = new Date(now.getTime() - windowMs);
    const [recent, latest] = await Promise.all([
      this.deps.codes.countRequestsSince(email, windowStart),
      this.deps.codes.latestCreatedAt(email),
    ]);
    const cooldownWait = latest === null ? 0 : latest.getTime() + cooldownSeconds * 1000 - now.getTime();
    let windowWait = 0;
    if (recent >= limit) {
      const oldest = await this.deps.codes.oldestCreatedAtSince(email, windowStart);
      windowWait = oldest === null ? 0 : oldest.getTime() + windowMs - now.getTime();
    }
    return Math.max(cooldownWait, windowWait);
  }

  private async send(email: string, code: string): Promise<void> {
    try {
      await this.deps.email.send(loginCodeEmail(email, code, LOGIN_CODE_TTL_MINUTES));
    } catch (error) {
      // The provider's own errors are already scrubbed; anything else may quote the message body, so it is dropped.
      throw error instanceof InfrastructureError ? error : new InfrastructureError("Sending the login code email failed");
    }
  }
}
