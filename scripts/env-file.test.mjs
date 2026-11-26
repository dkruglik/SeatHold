import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEnvFile, parsePostgresDatabaseUrl } from "./env-file.mjs";

describe("parseEnvFile", () => {
  it("parses keys, skips comments, and strips a BOM", () => {
    const content = "﻿APP_ENV=production\n# comment\nPOSTGRES_USER=seatholder\n";
    const parsed = parseEnvFile(content);
    assert.equal(parsed.APP_ENV, "production");
    assert.equal(parsed.POSTGRES_USER, "seatholder");
    assert.equal(parsed["# comment"], undefined);
  });

  it("strips inline comments after a space", () => {
    const parsed = parseEnvFile("HUMAN_VERIFICATION_PROVIDER=turnstile # local note\n");
    assert.equal(parsed.HUMAN_VERIFICATION_PROVIDER, "turnstile");
  });

  it("keeps a # that has no space before it", () => {
    assert.equal(parseEnvFile("URL=https://example.com/a#frag\n").URL, "https://example.com/a#frag");
  });

  it("keeps ' #' when inline comment stripping is off", () => {
    const parsed = parseEnvFile("SECRET=ab #cd\n", { stripInlineComments: false });
    assert.equal(parsed.SECRET, "ab #cd");
  });
});

describe("parsePostgresDatabaseUrl", () => {
  it("splits a PostgreSQL URL and defaults the port", () => {
    assert.deepEqual(parsePostgresDatabaseUrl("postgresql://user:p%40ss@db.example:6543/app"), {
      user: "user",
      password: "p@ss",
      host: "db.example",
      port: "6543",
      database: "app",
    });
    assert.equal(parsePostgresDatabaseUrl("postgres://u:p@localhost/app").port, "5432");
  });

  it("returns null without a host, a database name, or a valid URL", () => {
    assert.equal(parsePostgresDatabaseUrl("postgresql://u:p@localhost"), null);
    assert.equal(parsePostgresDatabaseUrl("not a url"), null);
  });
});
