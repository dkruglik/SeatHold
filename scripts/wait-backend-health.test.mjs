import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { backendHealthUrl, isHealthyBody } from "./wait-backend-health.mjs";

describe("isHealthyBody", () => {
  it("accepts the backend health JSON", () => {
    assert.equal(isHealthyBody('{"status":"ok"}'), true);
  });

  for (const value of ["", "not json", '{"status":"down"}', '{"ok":true}']) {
    it(`rejects ${JSON.stringify(value)}`, () => {
      assert.equal(isHealthyBody(value), false);
    });
  }
});

describe("backendHealthUrl", () => {
  it("defaults to port 3001 on loopback", () => {
    assert.equal(backendHealthUrl({}), "http://127.0.0.1:3001/api/health");
  });

  it("reads BACKEND_PORT from env", () => {
    assert.equal(backendHealthUrl({ BACKEND_PORT: "4555" }), "http://127.0.0.1:4555/api/health");
  });

  for (const value of ["abc", "0", "70000", "3001.5"]) {
    it(`rejects BACKEND_PORT=${value}`, () => {
      assert.throws(() => backendHealthUrl({ BACKEND_PORT: value }), /BACKEND_PORT/);
    });
  }
});