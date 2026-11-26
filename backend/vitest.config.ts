import { defineConfig } from "vitest/config";

// Backend test files share loaded modules (isolate: false); see .claude/rules/11-common-testing.md.
export default defineConfig({
  test: {
    isolate: false,
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts", "src/**/*.slow.test.ts", "src/generated/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.integration.test.ts", "src/**/*.slow.test.ts"],
          testTimeout: 30_000,
          hookTimeout: 30_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
