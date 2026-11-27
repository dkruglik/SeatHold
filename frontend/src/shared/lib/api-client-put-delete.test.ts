import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError } from "./api-client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function scripted(...responses: Array<() => Response>) {
  const seen: Array<{ url: string; init: RequestInit | undefined }> = [];
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

const token = (value: string) => () => json({ csrfToken: value });
const client = (fetchImpl: typeof fetch) => new ApiClient({ apiBaseUrl: "/api" }, fetchImpl);

describe("ApiClient.put and ApiClient.delete", () => {
  it("PUT sends the CSRF token and credentials, with no body or content type when none is given", async () => {
    const { fetchImpl, seen } = scripted(token("tok"), () => json({ seatIds: ["s1"] }));

    await expect(client(fetchImpl).put("/events/e/hold/seats/s1")).resolves.toEqual({ seatIds: ["s1"] });

    expect(seen.map((call) => call.url)).toEqual(["/api/auth/csrf", "/api/events/e/hold/seats/s1"]);
    const init = seen[1]?.init;
    expect(init?.method).toBe("PUT");
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).get("x-csrf-token")).toBe("tok");
    expect(new Headers(init?.headers).get("content-type")).toBeNull();
    expect(init?.body).toBeUndefined();
  });

  it("DELETE sends the CSRF token and returns undefined for 204", async () => {
    const { fetchImpl, seen } = scripted(token("tok"), () => new Response(null, { status: 204 }));

    await expect(client(fetchImpl).delete("/events/e/hold/seats/s1")).resolves.toBeUndefined();

    expect(seen[1]?.init?.method).toBe("DELETE");
    expect(new Headers(seen[1]?.init?.headers).get("x-csrf-token")).toBe("tok");
  });

  it("refetches the token once after 403 CSRF_INVALID and retries", async () => {
    const csrfInvalid = () => json({ error: { code: "CSRF_INVALID", message: "m" } }, 403);
    const { fetchImpl, seen } = scripted(token("old"), csrfInvalid, token("new"), () => new Response(null, { status: 204 }));

    await client(fetchImpl).delete("/x");

    expect(seen.map((call) => call.url)).toEqual(["/api/auth/csrf", "/api/x", "/api/auth/csrf", "/api/x"]);
    expect(new Headers(seen[3]?.init?.headers).get("x-csrf-token")).toBe("new");
  });

  it("throws an ApiError with status and code on a 409", async () => {
    const { fetchImpl } = scripted(token("t"), () => json({ error: { code: "SEAT_UNAVAILABLE", message: "m" } }, 409));

    const error = (await client(fetchImpl).put("/x").catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.code).toBe("SEAT_UNAVAILABLE");
  });
});
