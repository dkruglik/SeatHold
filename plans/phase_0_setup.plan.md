---
name: Phase 0 - Setup
overview: "Scaffold an empty but runnable SeatHolder full stack: npm workspaces, strict TypeScript, lint and tests, typed config, a Fastify backend with health, database-time clock and graceful shutdown, a Vite + React + Mantine frontend on the same /api origin, Docker Compose locally, a backend image and CI. Also starts the deliverables (install skill, README, DECISIONS.md, AI workflow log) so they grow with every later phase."
todos:
  - id: it-0-approvals
    content: Approve Phase 0 dependencies (exact pins), Node 24, the GitHub Actions decision for verify, and the public CLAUDE.md approach
    status: completed
  - id: it-1-git-hygiene
    content: .gitignore (install skill tracked, rules and skills local), standalone public CLAUDE.md, local agent index kept separate
    status: completed
  - id: it-2-workspaces-tooling
    content: Root and workspace package.json, tsconfig, ESLint limits, Vitest, verify.mjs aligned with the GitHub Actions workflow
    status: completed
  - id: it-3-config-and-local-infra
    content: Typed backend and frontend config with fail-fast tests, docker-compose.yml (Postgres 17, Mailpit), .env examples
    status: completed
  - id: it-4-backend-skeleton
    content: app/server bootstrap, Pino JSON logs, /api/health, Prisma service, SIGTERM shutdown, Clock port with database and controlled adapters
    status: completed
  - id: it-5-frontend-skeleton
    content: Vite + React + Mantine theme provider, router, TanStack Query, ApiClient on relative /api with dev proxy, placeholder page
    status: completed
  - id: it-6-image-and-ci
    content: backend/Dockerfile (multi-stage, non-root, health check, amd64 + arm64) and GitHub Actions workflow
    status: completed
  - id: it-7-deliverable-skeletons
    content: install-seathold skill v0, README, DECISIONS.md headings, AI workflow log, full verify
    status: completed
isProject: false
---

# Phase 0 - Setup

Roadmap: `plans/seatholder_product_roadmap.plan.md`, phase 0.

## 1. Context

The repository holds only the AI rules, skills and helper scripts. Every later phase needs the same base: workspaces, config, a backend and frontend that start, a database, and a verify command that matches CI. The deliverables (install skill, README, `DECISIONS.md`, AI workflow notes) start here so that the final clean-Mac run and the written answers are checks, not first attempts.

## 2. Agreed decisions

| Topic | Decision |
|---|---|
| Node | Node 24 LTS everywhere (`.nvmrc`, `engines`, Docker base image, CI, Homebrew `node@24`) |
| Package manager | npm workspaces: `backend/`, `frontend/`. Exact pinned versions (rule 12) |
| CI | GitHub Actions (`.github/workflows/ci.yml`). `scripts/verify.mjs` runs the same steps locally; references to `.gitlab-ci.yml` and `verify:ci-local` in `verify.mjs`, its tests, `00-governance` and the `verify` skill are replaced by the GitHub workflow in it-2 |
| Lint | ESLint flat config with typescript-eslint, `max-lines` 300 and `max-lines-per-function` 50 (blank lines and comments skipped), generated Prisma output ignored |
| Tests | Vitest in both workspaces. Backend integration tests run against an isolated database created by `scripts/test-db.mjs` |
| API origin | All backend routes under `/api`. Vite dev server proxies `/api` to the backend, so the browser sees one origin (production: CloudFront path routing) |
| Clock | `Clock` port in `backend/src/shared/time/`: `DatabaseClock` (`SELECT clock_timestamp()`) wired in the app, `ControlledClock` for tests. An operation reads the clock once and passes the value as `$now` to every statement it runs; no SQL statement calls `now()` itself |
| CORS | `@fastify/cors` is not installed: frontend and API share one origin, so cross-origin browser calls are refused by default |
| Log redaction | Pino `redact` for `req.headers.cookie`, `req.headers["x-csrf-token"]` and `res.headers["set-cookie"]`; request bodies are never logged, so codes and tokens cannot leak through logs |
| Local infra | Docker Compose: `postgres:17` and `axllent/mailpit`, pinned tags. Mac install skill uses Homebrew services with the same versions and `.env` keys (rule 50 exception) |
| Public `CLAUDE.md` | Committed, standalone: product summary, working rules in short (test first, module layout, locking model, verify command), where plans live. The current agent index (`AGENT.md` import, `.cursor/rules` pointers) moves to an untracked `CLAUDE.local.md` |
| `.gitignore` | Ignore `.cursor/`, `.claude/rules/`, `.claude/marketplace/`, `.claude/settings.local.json`, `.claude/skills/*` except `!.claude/skills/install-seathold/`; plus `node_modules`, `dist`, `coverage`, `.env`, `.env.*` except examples, `perf/` |
| Brief file | `plans/Appcharge_AC11_TeamLeader_AI_Test_Task.md` (with Part B) is ignored; only the Part A copy is committed |

## 3. Security principles

- No secret in the repository, the image, CI logs or `VITE_*` variables. `.env` is never committed; examples hold placeholders only.
- Config fails fast at startup; production refuses local-only values (for example a console email provider, added in Phase 1).
- The image runs as a non-root user and contains production dependencies only.

## 4. Architecture

```text
backend/src/
  app.ts                  buildApp(config, deps): registers plugins and module routes under /api
  server.ts               reads config, builds the app, listens, handles SIGTERM
  config/                 typed config (zod), loadConfig(), tests
  shared/time/            Clock port, DatabaseClock, ControlledClock
  shared/errors/          error types (validation, authentication, authorization, business, infrastructure)
  infrastructure/persistence/prisma-service.ts
  presentation/http/      health route, hooks/ (app-wide, empty for now)
backend/prisma/schema.prisma   datasource and generator only
frontend/src/
  app/                    providers (Mantine theme, QueryClient, router), config
  shared/lib/api-client.ts
  features/home/          placeholder page
```

## 5. Data model

None in this phase. `schema.prisma` has the datasource and generator only; the first migration lands in Phase 1.

## 6. Key flows

1. Start: `docker compose up -d` (Postgres, Mailpit), `npm run dev` runs backend (tsx watch) and frontend (Vite) together.
2. Health: `GET /api/health` returns `{ status: "ok" }` without touching heavy queries; the container health check and the ALB use it.
3. Shutdown: on `SIGTERM` the server stops accepting connections, finishes in-flight requests (bounded by `SHUTDOWN_TIMEOUT_MS`), closes Fastify, disconnects Prisma, exits 0.

## 7. Configuration

| Variable | Default | Secret | Notes |
|---|---|---|---|
| `APP_ENV` | `local` | no | `local` or `production` |
| `BACKEND_HOST` | `0.0.0.0` | no | |
| `BACKEND_PORT` | `3001` | no | |
| `DATABASE_URL` | `postgresql://seatholder:seatholder@localhost:5432/seatholder` (local example only) | yes in production | |
| `LOG_LEVEL` | `info` | no | |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | no | below the ECS stop timeout |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | no | used by the Origin check from Phase 1 |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `seatholder` | local only | Docker Compose |

## 8. HTTP API

| Route | Auth | Notes |
|---|---|---|
| `GET /api/health` | none | liveness for container and ALB |

## 9. Iterations

Each iteration: tests first (confirm they fail), implementation, `npm run verify-fast-part`; the full `npm run verify` before push.

- **it-0 Approvals.** Dependencies: `fastify`, `@fastify/cookie`, `prisma`, `@prisma/client`, `zod`, `pino-pretty` (dev), `react`, `react-dom`, `react-router`, `@tanstack/react-query`, `@mantine/core`, `@mantine/hooks`, `@mantine/dates`, `dayjs`, `vite`, `@vitejs/plugin-react`, `typescript`, `tsx`, `vitest`, `eslint`, `typescript-eslint`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `concurrently` (dev). Node 24. GitHub Actions replaces the GitLab references.
- **it-1 Git hygiene.** `.gitignore` as agreed; `CLAUDE.md` rewritten standalone; `CLAUDE.local.md` holds the agent index. Test: `scripts/line-endings.test.mjs` and a new check that `.claude/skills/install-seathold/` is not ignored (`git check-ignore`).
- **it-2 Workspaces and tooling.** Root `package.json` scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `test:integration`, `verify`, `verify-fast-part`, `verify-slow-part`, `db:start`, `db:stop`, `db:migrate`, `db:migrate:deploy`, `db:generate`, `db:seed`. `tsconfig.base.json` strict. `verify.mjs` and `verify.test.mjs` updated to the GitHub workflow. Tests: existing `scripts/*.test.mjs` that need `package.json` now pass.
- **it-3 Config and local infra.** Backend `loadConfig` with zod; frontend config for `VITE_*`. Tests first: missing `DATABASE_URL` fails, invalid port fails, unknown `APP_ENV` fails, defaults applied. `docker-compose.yml`, `.env.example`, `.env.local.example`, `.env.docker.local.example`.
- **it-4 Backend skeleton.** Tests first: `GET /api/health` returns 200 with the body (route test via `app.inject`); shutdown closes the app and Prisma (unit with fakes); `DatabaseClock` returns a time within 1 s of a separate `SELECT clock_timestamp()` (integration); `ControlledClock` advances deterministically (unit); a logged request shows `Cookie`, `Set-Cookie` and `X-CSRF-Token` as `[Redacted]` (unit with a captured logger).
- **it-5 Frontend skeleton.** Tests first: app renders the placeholder inside the Mantine provider; `ApiClient` calls relative `/api/...` with `credentials: "include"` and maps non-2xx to a typed error. Vite proxy for `/api`.
- **it-6 Image and CI.** `backend/Dockerfile` multi-stage (`node:24-alpine`), non-root, `HEALTHCHECK` on `/api/health`, Prisma `binaryTargets` for `linux-musl-openssl-3.0.x` and `linux-musl-arm64-openssl-3.0.x`. `.github/workflows/ci.yml`: install, lint, typecheck, unit and integration tests with a `postgres:17` service, build, `docker buildx build --platform linux/amd64,linux/arm64` without push. Test: `scripts/` checks for Dockerfile hygiene adapted from the existing ones.
  GitHub Actions passed on main after the merges (owner-confirmed, 2026-11-27); arm64 is not proven on the dev host.
- **it-7 Deliverable skeletons.** `.claude/skills/install-seathold/SKILL.md` v0 (check macOS, install Homebrew non-interactively if missing, `brew install node@24 postgresql@17 mailpit`, start services, create role and database, copy `.env`, `npm ci`, migrate, start backend and frontend, wait for `/api/health`, print URLs). `README.md` (what it is, run on Windows with Docker, run on Mac without the skill). `DECISIONS.md` already exists from planning: move the entries this phase implements (O1, O3, O4, O5, O13, O14, O15) to `implemented` with files and tests. `docs/ai-workflow-log.md` started. Full `npm run verify`; update the roadmap todo.
  Skipped by the owner's decision (2026-11-27, no Mac available; accepted risk): the install skill has not run on a clean Mac; the Homebrew path is unproven.

## 10. Verification summary

- Unit: config schema, clock adapters, shutdown sequence, ApiClient.
- Integration: health route, `DatabaseClock` against the test database.
- CI: lint, typecheck, tests, build, multi-arch image build.
- Manual: Windows `docker compose up -d && npm run dev` serves `http://localhost:5173` and `http://localhost:5173/api/health`.

## 11. Out of scope / future

- Deployment to AWS (designed for, not done).
- Any domain schema (Phase 1 onward).
- Pushing images to a registry.
