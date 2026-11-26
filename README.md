# SeatHolder

SeatHolder is a ticketing system for events with numbered seats (the "SeatHold" brief). Buyers pick seats and hold them for a short time, then pay with a mock payment; guests reach their tickets through a link; admins manage events. Seat holds are decided in PostgreSQL so that several backend instances agree. The design is for AWS, but nothing is deployed.

Status: Phase 0 (setup). The backend and frontend start and serve a health check; the product features arrive in later phases. The plan is in [`plans/seatholder_product_roadmap.plan.md`](plans/seatholder_product_roadmap.plan.md) and every design decision and trade-off is in [`DECISIONS.md`](DECISIONS.md).

## Requirements

- Node 24 (version in `.nvmrc`) and npm.
- Docker with Compose, for PostgreSQL 17 and Mailpit (Windows, Linux). On a Mac you can use Homebrew services instead, see below.

## Run on Windows or Linux (Docker)

```sh
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
docker compose up -d
npm ci
npm run db:generate
npm run dev
```

- App: http://localhost:5173
- Health check: http://localhost:5173/api/health (the Vite dev server proxies `/api` to the backend on port 3001, so the browser sees one origin)
- Mail inbox (Mailpit): http://localhost:8025

Stop the database and mail catcher with `docker compose down`.

## Run on a Mac without the install skill

The skill in `.claude/skills/install-seathold/` automates these steps. By hand:

```sh
brew install node@24 postgresql@17 mailpit
brew services start postgresql@17
brew services start mailpit
cp .env.example .env
```

Create the role and database named by `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` in `.env` (defaults: all `seatholder`) so that `DATABASE_URL` works, then run `npm ci`, `npm run db:generate` and `npm run dev`. The app reads the same `.env` keys as with Docker; it cannot tell the two setups apart. Make sure `node@24` is first on your `PATH` (`brew info node@24` prints the line to add).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Backend and frontend together, with reload |
| `npm run build` | Builds backend and frontend |
| `npm run lint` | AI-rule sync check, then ESLint in both workspaces |
| `npm run typecheck` | TypeScript check in both workspaces |
| `npm run test` | Unit tests, script tests and backend integration tests (isolated test database) |
| `npm run test:integration` | Backend integration tests only |
| `npm run verify` | The full definition-of-done suite (see below) |
| `npm run verify-fast-part` | Everything except `*.slow.test.ts` integration files |
| `npm run verify-slow-part` | Only the `*.slow.test.ts` integration files |
| `npm run db:start` | Starts the Compose PostgreSQL and waits until healthy |
| `npm run db:stop` | Stops the Compose stack |
| `npm run db:generate` | Generates the Prisma client |
| `npm run db:migrate` | Creates and applies a migration in development |
| `npm run db:migrate:deploy` | Applies existing migrations |
| `npm run db:seed` | Runs the seed script |

`db:migrate` and `db:seed` have nothing to apply until Phase 1 adds the schema.

## Tests and verify

`npm run verify` runs the same steps as the GitHub Actions workflow (`.github/workflows/ci.yml`): database, lint, typecheck, tests, build and a security scan. During development `npm run verify-fast-part` is quicker; run `npm run verify-slow-part` (or the full `npm run verify`) on the final commit before pushing. Tests are written first, in Vitest for the workspaces and `node:test` for `scripts/`.

## Backend image

```sh
docker build -f backend/Dockerfile -t seatholder-backend .
```

The build context is the repository root. The image contains no `.env` or secret; configuration comes from environment variables at run time. CI also builds it for `linux/amd64` and `linux/arm64` without pushing.

## Repository layout

| Path | Content |
|---|---|
| `backend/` | Fastify API, Prisma, config, `Dockerfile` |
| `frontend/` | React, Vite and Mantine app |
| `scripts/` | Verify, test-database and repository helper scripts, with `node:test` tests |
| `plans/` | Roadmap and per-phase plans |
| `DECISIONS.md` | Design decisions and trade-offs |
| `docs/ai-workflow-log.md` | How AI was used and checked |
| `.claude/skills/install-seathold/` | macOS install skill |
| `CLAUDE.md` | Working rules for AI agents |
| `.env.example` | Non-secret defaults for every variable |
