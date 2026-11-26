import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertEnoughDomains,
  blocklistUrl,
  buildDomainFile,
  minimumDomains,
  parseBlocklist,
} from "./update-disposable-domains.mjs";

describe("update disposable domains", () => {
  it("downloads the upstream blocklist from the CC0 repository", () => {
    assert.equal(
      blocklistUrl,
      "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf",
    );
  });

  it("normalizes, dedupes and sorts domains", () => {
    const text = "# c\r\nZeta.com\r\n\r\n  alpha.com  \nzeta.com\nbeta.org\n";

    assert.deepEqual(parseBlocklist(text), ["alpha.com", "beta.org", "zeta.com"]);
  });

  it("drops lines that are not a domain", () => {
    assert.deepEqual(parseBlocklist("ok.com\nhas space.com\nnodot\nhttp://x.com\n"), ["ok.com"]);
  });

  it("refuses a list under 1000 domains", () => {
    assert.equal(minimumDomains, 1000);
    assert.throws(() => assertEnoughDomains(new Array(999).fill("a.com")), /1000/);
    assert.doesNotThrow(() => assertEnoughDomains(new Array(1000).fill("a.com")));
  });

  it("writes a comment header naming the CC0 source, then one domain per line", () => {
    const file = buildDomainFile(["a.com", "b.com"]);
    const lines = file.split("\n");

    assert.ok(lines[0].startsWith("#"));
    assert.match(file, /CC0/);
    assert.match(file, /disposable-email-domains\/disposable-email-domains/);
    assert.deepEqual(lines.filter((line) => !line.startsWith("#") && line !== ""), ["a.com", "b.com"]);
    assert.ok(file.endsWith("\n"));
  });
});
