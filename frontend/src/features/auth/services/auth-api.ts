import { ApiError, type ApiClient } from "../../../shared/lib/api-client";
import type { AuthUser, RequestCodeResult } from "../types";

/** The auth endpoints of the backend. Mutations carry the CSRF token because they go through `ApiClient.post`. */
export class AuthApi {
  constructor(private readonly client: ApiClient) {}

  async getMe(): Promise<AuthUser | null> {
    const body = await this.client.get<{ user: AuthUser | null }>("/auth/me");
    return body.user;
  }

  async requestCode(email: string): Promise<RequestCodeResult> {
    try {
      await this.client.post<undefined>("/auth/request-code", { email });
      return { kind: "sent" };
    } catch (error) {
      if (error instanceof ApiError && error.status === 429 && error.retryAfterSeconds !== undefined) {
        return { kind: "rate_limited", retryAfterSeconds: error.retryAfterSeconds };
      }
      throw error;
    }
  }

  /** Resolves with the user, or throws `ApiError` with code `INVALID_CODE`. */
  async verify(email: string, code: string): Promise<AuthUser> {
    const body = await this.client.post<{ user: AuthUser }>("/auth/verify", { email, code });
    return body.user;
  }

  async logout(): Promise<void> {
    await this.client.post<undefined>("/auth/logout");
  }

  async logoutAll(): Promise<void> {
    await this.client.post<undefined>("/auth/logout-all");
  }
}
