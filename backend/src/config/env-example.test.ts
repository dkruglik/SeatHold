import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { configVariableNames } from "./load-config.js";

// Variables in .env.example that the backend schema does not read: Docker Compose (docker-compose.yml)
// and the frontend (frontend/src/app/config, checked by its own test).
const composeVariables = ["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB"];
const frontendVariables = ["VITE_API_BASE_URL"];

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
    expect(documented).toEqual(expect.arrayContaining([...configVariableNames]));
  });

  it("holds only variables the schema, Docker Compose or the frontend know", () => {
    const known = new Set<string>([...configVariableNames, ...composeVariables, ...frontendVariables]);

    expect(documented.filter((name) => !known.has(name))).toEqual([]);
  });

  it("keeps the other example files to variables the schema, Docker Compose or the frontend know", () => {
    const known = new Set<string>([...configVariableNames, ...composeVariables, ...frontendVariables]);
    for (const file of [".env.local.example", ".env.docker.local.example"]) {
      expect(exampleVariables(file).filter((name) => !known.has(name))).toEqual([]);
    }
  });
});
