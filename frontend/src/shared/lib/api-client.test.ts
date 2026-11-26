import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiError, ApiNetworkError } from "./api-client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function clientWith(fetchImpl: typeof fetch, apiBaseUrl = "/api"): ApiClient {
  return new ApiClient({ apiBaseUrl }, fetchImpl);
}

function firstCall(fetchImpl: ReturnType<typeof vi.fn<typeof fetch>>): [RequestInfo | URL, RequestInit | undefined] {
  const call = fetchImpl.mock.calls[0];
  if (call === undefined) {
    throw new Error("fetch was not called");
  }
  return [call[0], call[1]];
}

describe("ApiClient.get requests", () => {
  it("requests a relative /api URL with credentials included and returns the parsed JSON", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ status: "ok" }));

    const result = await clientWith(fetchImpl).get<{ status: string }>("/health");

    expect(result).toEqual({ status: "ok" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = firstCall(fetchImpl);
    expect(url).toBe("/api/health");
    expect(init?.method).toBe("GET");
    expect(init?.credentials).toBe("include");
    expect(new Headers(init?.headers).get("accept")).toBe("application/json");
  });

  it("returns undefined for 204 No Content", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(clientWith(fetchImpl).get("/ping")).resolves.toBeUndefined();
  });

  it("rejects a path that does not start with a slash", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(clientWith(fetchImpl).get("health")).rejects.toThrowError(TypeError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a protocol-relative path, which would leave the API origin", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(clientWith(fetchImpl).get("//evil.example/x")).rejects.toThrowError(TypeError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("joins the configured same-origin base path and the request path", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));

    await clientWith(fetchImpl, "/service/api").get("/health");

    expect(firstCall(fetchImpl)[0]).toBe("/service/api/health");
  });
});

describe("ApiClient.get failures", () => {
  it("maps a non-2xx response to an ApiError with the status and the body code", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ code: "seat_taken", message: "secret-detail" }, 409));

    const error = await clientWith(fetchImpl).get("/seats").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
    expect((error as ApiError).code).toBe("seat_taken");
  });

  it("leaves the code undefined when the body has none or is not JSON", async () => {
    for (const response of [jsonResponse({ message: "x" }, 500), new Response("<html>boom</html>", { status: 502 })]) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
      const error = (await clientWith(fetchImpl).get("/x").catch((e: unknown) => e)) as ApiError;

      expect(error).toBeInstanceOf(ApiError);
      expect(error.code).toBeUndefined();
    }
  });

  it("never puts the response body text in the error message", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("session=abc123 secret-body", { status: 500 }));

    const error = (await clientWith(fetchImpl).get("/x").catch((e: unknown) => e)) as ApiError;

    expect(error.message).not.toContain("secret-body");
    expect(error.message).not.toContain("abc123");
    expect(JSON.stringify(error)).not.toContain("secret-body");
  });

  it("surfaces a network failure as an ApiNetworkError", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await clientWith(fetchImpl).get("/x").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiNetworkError);
    expect(error).not.toBeInstanceOf(ApiError);
  });

  it("surfaces an unreadable 2xx body as an ApiError carrying the status", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("not json", { status: 200 }));

    const error = (await clientWith(fetchImpl).get("/x").catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(200);
  });
});
