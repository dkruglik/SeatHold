import { describe, expect, it } from "vitest";
import { generateTicketCode } from "./ticket-code.js";

describe("generateTicketCode", () => {
  it("is 128 bits of base64url (22 characters, URL-safe alphabet)", () => {
    expect(generateTicketCode()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("does not repeat across many calls", () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateTicketCode()));
    expect(codes.size).toBe(2000);
  });
});
