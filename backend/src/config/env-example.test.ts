import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { configVariableNames, localCsrfSecretPlaceholder, localPepperPlaceholder } from "./load-config.js";

// Variables in .env.example that the backend schema does not read: Docker Compose (docker-compose.yml)
// and the frontend (frontend/src/app/config, checked by its own test).
const composeVariables = ["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"];
const frontendVariables = ["VITE_API_BASE_URL"];
// Schema variables that .env.example intentionally leaves out: SMTP_PASS is a secret (production injects it);
// SMTP_USER is optional and only meaningful together with SMTP_PASS, so local Mailpit needs neither.
// The only secret variable .env.example assigns, with a placeholder that is for local development only:
// loadConfig refuses it when APP_ENV=production (DECISIONS.md O42).
const secretsWithLocalPlaceholder = ["AUTH_CODE_PEPPER", "CSRF_SECRET"];
const intentionallyUndocumented = ["SMTP_USER", "SMTP_PASS"];

function exampleVariables(file: string): string[] {
  const text = readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined);
}

describe(".env.example", () => {
  const documented = exampleVariables(".env.example");

  it("documents every variable the config schema reads", () => {
    expect(documented).toEqual(expect.arrayContaining(configVariableNames.filter((name) => !intentionallyUndocumented.includes(name))));
  });

  it("holds only variables the schema, Docker Compose or the frontend know", () => {
    const known = new Set<string>([...configVariableNames, ...composeVariables, ...frontendVariables]);

    expect(documented.filter((name) => !known.has(name))).toEqual([]);
  });

  it("never documents a secret variable, except the one clearly-local placeholder", () => {
    expect(documented).not.toContain("SMTP_PASS");
    expect(intentionallyUndocumented).toContain("SMTP_PASS");
    expect(secretsWithLocalPlaceholder).toEqual(["AUTH_CODE_PEPPER", "CSRF_SECRET"]);
  });

  it("gives AUTH_CODE_PEPPER the local placeholder that production refuses", () => {
    const text = readFileSync(new URL("../../../.env.example", import.meta.url), "utf8");

    expect(text).toContain(`AUTH_CODE_PEPPER=${localPepperPlaceholder}\n`);
    expect(localPepperPlaceholder.length).toBeGreaterThanOrEqual(32);
  });

  it("gives CSRF_SECRET the local placeholder that production refuses", () => {
    const text = readFileSync(new URL("../../../.env.example", import.meta.url), "utf8");

    expect(text).toContain(`CSRF_SECRET=${localCsrfSecretPlaceholder}\n`);
  });

  it("keeps the other example files to variables the schema, Docker Compose or the frontend know", () => {
    const known = new Set<string>([...configVariableNames, ...composeVariables, ...frontendVariables]);
    expect(exampleVariables(".env.docker.local.example").filter((name) => !known.has(name))).toEqual([]);
  });
});
