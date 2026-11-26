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
