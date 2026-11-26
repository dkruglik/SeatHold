/** A stored login code. Only the hash is kept; the service decides what the attempt count means. */
export class LoginCode {
  constructor(
    readonly id: string,
    readonly email: string,
    readonly codeHash: string,
    readonly expiresAt: Date,
    readonly attempts: number,
    readonly createdAt: Date,
  ) {}
}

/** A code is valid for ten minutes after it is created. A domain rule, not configuration (DECISIONS.md O43). */
export const LOGIN_CODE_TTL_MINUTES = 10;

/** After this many wrong guesses the code is dead, even for the right value. */
export const MAX_LOGIN_CODE_ATTEMPTS = 5;
