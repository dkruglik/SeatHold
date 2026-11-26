import { defineConfig, mergeConfig } from "vitest/config";
import { createViteConfig } from "./vite.config.ts";

export default mergeConfig(
  createViteConfig({}),
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}", "*.test.ts"],
      setupFiles: ["./src/test/setup.ts"],
    },
  }),
);
