import { describe, expect, it } from "vitest";
import { holderFrom, resolveHolder } from "./holder.js";

describe("holderFrom", () => {
  it("accepts a user", () => {
    expect(holderFrom({ userId: "u1" })).toEqual({ kind: "user", userId: "u1" });
  });

  it("accepts a visitor", () => {
    expect(holderFrom({ visitorHash: "h1" })).toEqual({ kind: "visitor", visitorHash: "h1" });
  });

  it("holder with both user and visitor is rejected", () => {
    expect(() => holderFrom({ userId: "u1", visitorHash: "h1" })).toThrow();
  });

  it("holder with neither user nor visitor is rejected", () => {
    expect(() => holderFrom({})).toThrow();
  });
});

describe("resolveHolder", () => {
  it("a signed-in user wins over a visitor token", () => {
    expect(resolveHolder({ userId: "u1", visitorHash: "h1" })).toEqual({ kind: "user", userId: "u1" });
  });

  it("falls back to the visitor when nobody is signed in", () => {
    expect(resolveHolder({ visitorHash: "h1" })).toEqual({ kind: "visitor", visitorHash: "h1" });
  });

  it("is undefined when there is neither a session nor a visitor token", () => {
    expect(resolveHolder({})).toBeUndefined();
  });
});
