import { defineConfig, mergeConfig } from "vitest/config";
import { createViteConfig } from "./vite.config.ts";

export default mergeConfig(
  createViteConfig({}),
  defineConfig({
    test: {
      environment: "jsdom",
      // vmThreads reuses one jsdom per worker (isolated VM contexts): ~12 s vs ~15-23 s; isolate:false would leak state.
      pool: "vmThreads",
      include: ["src/**/*.test.{ts,tsx}", "*.test.ts"],
      setupFiles: ["./src/test/setup.ts"],
    },
  }),
);
