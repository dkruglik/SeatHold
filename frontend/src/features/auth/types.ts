export type Role = "buyer" | "admin";

/** The signed-in user as `/api/auth/me` returns it. No tokens, no session data. */
export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
}

export type RequestCodeResult = { readonly kind: "sent" } | { readonly kind: "rate_limited"; readonly retryAfterSeconds: number };
