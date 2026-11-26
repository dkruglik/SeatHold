import { describe, expect, it } from "vitest";
import { createFakeBackend } from "../../../test/fake-backend";
import { ApiClient, ApiError } from "../../../shared/lib/api-client";
import { AuthApi } from "./auth-api";

function setup(options: Parameters<typeof createFakeBackend>[0] = {}) {
  const backend = createFakeBackend(options);
  return { backend, api: new AuthApi(new ApiClient({ apiBaseUrl: "/api" }, backend.fetchImpl)) };
}

describe("AuthApi", () => {
  it("getMe returns the user, or null when anonymous", async () => {
    const user = { id: "u", email: "a@b.c", role: "admin" } as const;

    expect(await setup({ user }).api.getMe()).toEqual(user);
    expect(await setup().api.getMe()).toBeNull();
  });

  it("requestCode posts the email and reports sent", async () => {
    const { api, backend } = setup();

    await expect(api.requestCode("a@b.c")).resolves.toEqual({ kind: "sent" });
    expect(backend.calls.at(-1)).toMatchObject({ method: "POST", path: "/auth/request-code", body: { email: "a@b.c" } });
  });

  it("requestCode reports rate_limited with the retry time", async () => {
    const { api } = setup({ rateLimitedForSeconds: 42 });

    await expect(api.requestCode("a@b.c")).resolves.toEqual({ kind: "rate_limited", retryAfterSeconds: 42 });
  });

  it("verify returns the signed-in user", async () => {
    const { api, backend } = setup();

    await expect(api.verify("a@b.c", "123456")).resolves.toEqual({ id: "user-1", email: "a@b.c", role: "buyer" });
    expect(backend.calls.at(-1)?.body).toEqual({ email: "a@b.c", code: "123456" });
  });

  it("verify throws ApiError INVALID_CODE for a wrong code", async () => {
    const error = (await setup().api.verify("a@b.c", "000000").catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("INVALID_CODE");
  });

  it("logout and logoutAll post to their routes with the CSRF token", async () => {
    const { api, backend } = setup({ user: { id: "u", email: "a@b.c", role: "buyer" } });

    await api.logout();
    await api.logoutAll();

    const posts = backend.calls.filter((call) => call.method === "POST");
    expect(posts.map((call) => call.path)).toEqual(["/auth/logout", "/auth/logout-all"]);
    expect(posts.every((call) => call.csrfToken === "token-1")).toBe(true);
  });
});
