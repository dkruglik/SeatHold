import type { User } from "../domain/user.js";
import type { SessionService } from "./session-service.js";
import type { VerifyLoginCodeInput, VerifyLoginCodeResult } from "./verify-login-code-service.js";

export interface LoginInput extends VerifyLoginCodeInput {
  /** The `sid` the browser sent with the login request, if any. */
  readonly presentedToken?: string | undefined;
}

export type LoginResult = { readonly kind: "logged_in"; readonly user: User; readonly token: string } | { readonly kind: "invalid_code" };

export interface LoginServiceDeps {
  readonly verify: { execute(input: VerifyLoginCodeInput): Promise<VerifyLoginCodeResult> };
  readonly sessions: SessionService;
}

/**
 * Login: verifies the code, then starts a brand-new session. Rotation: a session id the request carried is never reused,
 * and a live one is revoked, so a fixated or stolen pre-login id stops working at login.
 */
export class LoginService {
  constructor(private readonly deps: LoginServiceDeps) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const verified = await this.deps.verify.execute({ email: input.email, code: input.code });
    if (verified.kind !== "verified") {
      return { kind: "invalid_code" };
    }
    if (input.presentedToken !== undefined) {
      const previous = await this.deps.sessions.authenticate(input.presentedToken);
      if (previous !== null) {
        await this.deps.sessions.revoke(previous.id);
      }
    }
    const created = await this.deps.sessions.create(verified.user.id);
    return { kind: "logged_in", user: verified.user, token: created.token };
  }
}
