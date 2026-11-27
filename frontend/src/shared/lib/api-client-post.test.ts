import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "./api-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const csrfInvalid = () => jsonResponse({ error: { code: "CSRF_INVALID", message: "m" } }, 403);

interface Seen {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function scripted(...responses: Array<() => Response>): { fetchImpl: typeof fetch; seen: Seen[] } {
  const seen: Seen[] = [];
  const queue = [...responses];
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation((input, init) => {
    seen.push({ url: String(input), init });
    const next = queue.shift();
    if (next === undefined) {
      throw new Error(`unexpected request ${String(input)}`);
    }
    return Promise.resolve(next());
  });
  return { fetchImpl, seen };
}

const token = (value: string) => () => jsonResponse({ csrfToken: value });
const client = (fetchImpl: typeof fetch) => new ApiClient({ apiBaseUrl: "/api" }, fetchImpl);

describe("ApiClient.post", () => {
  it("fetches the CSRF token first, then sends it as X-CSRF-Token with credentials and a JSON body", async () => {
    const { fetchImpl, seen } = scripted(token("tok-1"), () => jsonResponse({ ok: true }));

    const result = await client(fetchImpl).post<{ ok: boolean }>("/auth/verify", { email: "a@b.c", code: "123456" });

    expect(result).toEqual({ ok: true });
    expect(seen.map((call) => call.url)).toEqual(["/api/auth/csrf", "/api/auth/verify"]);
    expect(seen[0]?.init?.credentials).toBe("include");
    const post = seen[1]?.init;
    expect(post?.method).toBe("POST");
    expect(post?.credentials).toBe("include");
    const headers = new Headers(post?.headers);
    expect(headers.get("x-csrf-token")).toBe("tok-1");
    expect(headers.get("content-type")).toBe("application/json");
    expect(post?.body).toBe(JSON.stringify({ email: "a@b.c", code: "123456" }));
  });

  it("keeps the token in memory and reuses it for the next mutation", async () => {
    const { fetchImpl, seen } = scripted(token("tok-1"), () => new Response(null, { status: 204 }), () => new Response(null, { status: 204 }));
    const api = client(fetchImpl);

    await api.post("/auth/logout");
    await api.post("/auth/logout");

    expect(seen.map((call) => call.url)).toEqual(["/api/auth/csrf", "/api/auth/logout", "/api/auth/logout"]);
    expect(new Headers(seen[2]?.init?.headers).get("x-csrf-token")).toBe("tok-1");
  });

  it("returns undefined for 204 and sends no body when none is given", async () => {
    const { fetchImpl, seen } = scripted(token("t"), () => new Response(null, { status: 204 }));

    await expect(client(fetchImpl).post("/auth/logout")).resolves.toBeUndefined();
    expect(seen[1]?.init?.body).toBeUndefined();
    expect(new Headers(seen[1]?.init?.headers).get("content-type")).toBeNull();
  });

  it("refetches the token once after 403 CSRF_INVALID and retries the request once", async () => {
    const { fetchImpl, seen } = scripted(token("old"), csrfInvalid, token("new"), () => jsonResponse({ ok: true }));

    const result = await client(fetchImpl).post("/auth/verify", { a: 1 });

    expect(result).toEqual({ ok: true });
    expect(seen.map((call) => call.url)).toEqual(["/api/auth/csrf", "/api/auth/verify", "/api/auth/csrf", "/api/auth/verify"]);
    expect(new Headers(seen[3]?.init?.headers).get("x-csrf-token")).toBe("new");
  });

  it("gives up after one retry and throws the ApiError, so there is no loop", async () => {
    const { fetchImpl, seen } = scripted(token("a"), csrfInvalid, token("b"), csrfInvalid);

    const error = (await client(fetchImpl).post("/x").catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(403);
    expect(error.code).toBe("CSRF_INVALID");
    expect(seen).toHaveLength(4);
  });

});

describe("ApiClient.post failures", () => {
  it("does not retry other 403 answers", async () => {
    const { fetchImpl, seen } = scripted(token("a"), () => jsonResponse({ error: { code: "FORBIDDEN_ROLE", message: "m" } }, 403));

    const error = (await client(fetchImpl).post("/x").catch((e: unknown) => e)) as ApiError;

    expect(error.code).toBe("FORBIDDEN_ROLE");
    expect(seen).toHaveLength(2);
  });

  it("does not send the mutation when the token cannot be fetched", async () => {
    const { fetchImpl, seen } = scripted(() => jsonResponse({ error: { code: "internal_error", message: "m" } }, 500));

    const error = (await client(fetchImpl).post("/x", {}).catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(500);
    expect(seen.map((call) => call.url)).toEqual(["/api/auth/csrf"]);
  });

  it("rejects a token response without a token string", async () => {
    const { fetchImpl, seen } = scripted(() => jsonResponse({}));

    await expect(client(fetchImpl).post("/x")).rejects.toBeInstanceOf(ApiError);
    expect(seen).toHaveLength(1);
  });

  it("keeps the same path validation as get", async () => {
    const { fetchImpl, seen } = scripted();

    await expect(client(fetchImpl).post("x")).rejects.toThrowError(TypeError);
    await expect(client(fetchImpl).post("//evil.example/x")).rejects.toThrowError(TypeError);
    expect(seen).toHaveLength(0);
  });

  it("carries retryAfterSeconds of a 429 body on the ApiError", async () => {
    const body = { error: { code: "RATE_LIMITED", message: "m" }, retryAfterSeconds: 42 };
    const { fetchImpl } = scripted(token("t"), () => jsonResponse(body, 429));

    const error = (await client(fetchImpl).post("/auth/request-code", {}).catch((e: unknown) => e)) as ApiError;

    expect(error.status).toBe(429);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.retryAfterSeconds).toBe(42);
  });

  it("carries the server's error message as detail", async () => {
    const { fetchImpl } = scripted(token("t"), () => jsonResponse({ error: { code: "INVALID_EVENT", message: "rows must be an integer from 1 to 200" } }, 400));

    const error = (await client(fetchImpl).post("/admin/events", {}).catch((e: unknown) => e)) as ApiError;

    expect(error.detail).toBe("rows must be an integer from 1 to 200");
  });

  it("never writes the token to web storage or the console", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { fetchImpl } = scripted(token("secret-token-value"), () => new Response(null, { status: 204 }));

    await client(fetchImpl).post("/auth/logout");

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
