import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type UserConfig } from "vite";

const defaultBackendPort = 3001;

function backendPort(env: Readonly<Record<string, string | undefined>>): number {
  const raw = env.BACKEND_PORT;
  if (raw === undefined || raw === "") {
    return defaultBackendPort;
  }
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port < 1 || port > 65535) {
    throw new Error("Invalid configuration: BACKEND_PORT must be an integer from 1 to 65535");
  }
  return port;
}

/** The browser sees one origin: the dev server forwards /api to the backend, as CloudFront does in production. */
export function createViteConfig(env: Readonly<Record<string, string | undefined>>): UserConfig {
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": { target: `http://127.0.0.1:${backendPort(env)}`, changeOrigin: false },
      },
    },
  };
}

// The backend reads the repository-root .env, so the proxy does too (not the working directory, which is frontend/).
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadViteConfig(mode: string, rootDir: string = repositoryRoot): UserConfig {
  return createViteConfig(loadEnv(mode, rootDir, "BACKEND_"));
}

export default defineConfig(({ mode }) => loadViteConfig(mode));
