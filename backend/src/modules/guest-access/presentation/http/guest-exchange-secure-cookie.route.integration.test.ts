import { describe, expect, it } from "vitest";
import { useGuestApp } from "./guest-route-test-support.js";

const harness = useGuestApp({ cookieSecure: true });

describe("POST /api/guest/exchange with COOKIE_SECURE on (production)", () => {
  it("sets the gsid cookie with the Secure attribute", async () => {
    const { token } = await harness.bookingWithLink();

    const response = await harness.post("/api/guest/exchange", { token });

    expect(response.cookies.find((c) => c.name === "gsid")).toMatchObject({ secure: true, httpOnly: true, sameSite: "Lax", path: "/api" });
  });
});
