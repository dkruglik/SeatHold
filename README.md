# SeatHolder

SeatHolder is a ticketing system for events with numbered seats (the "SeatHold" brief). Buyers pick seats and hold them for a short time, then pay with a mock payment; guests reach their tickets through a link; admins manage events. Seat holds are decided in PostgreSQL so that several backend instances agree. The design is for AWS, but nothing is deployed.

Status: Phase 1 (auth and access) on top of Phase 0 (setup). The backend and frontend start, serve a health check, and log users in by emailed code with buyer and admin roles; the product features arrive in later phases. The plan is in [`plans/seatholder_product_roadmap.plan.md`](plans/seatholder_product_roadmap.plan.md) and every design decision and trade-off is in [`DECISIONS.md`](DECISIONS.md).

## Requirements

- Node 24 (version in `.nvmrc`) and npm.
- Docker with Compose, for PostgreSQL 17 and Mailpit (Windows, Linux). On a Mac you can use Homebrew services instead, see below.

## Run on Windows or Linux (Docker)

```sh
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
docker compose up -d
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
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

Create the role and database named by `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` in `.env` (defaults: all `seatholder`) so that `DATABASE_URL` works, then run `npm ci`, `npm run db:generate`, `npm run db:migrate:deploy`, `npm run db:seed` and `npm run dev`. The app reads the same `.env` keys as with Docker; it cannot tell the two setups apart. Make sure `node@24` is first on your `PATH` (`brew info node@24` prints the line to add).

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
| `npm run db:seed` | Creates the local admin and buyer accounts if missing; safe to repeat; refuses to run with `APP_ENV=production` |
| `npm run user:promote -- <email>` | Makes an existing user an admin (the person signs in once first) |
| `npm run user:demote -- <email>` | Makes an existing admin a buyer again; takes effect on their next request |

Roles never change over HTTP: only `user:promote`, `user:demote` and the seed set them. The scripts print an email and a role, nothing else.

## Authentication

Login is passwordless: the person enters an email address, receives a six-digit code by email and enters it. One flow serves buyers and admins. A code is valid for 10 minutes, allows 5 wrong attempts and works once; a new request invalidates the earlier one. Requests are limited per email address and counted in PostgreSQL, so the limit holds across backend instances.

- **Roles.** `buyer` is the default: verifying a code for an unknown address creates a buyer. `admin` is granted only by the seed or by `npm run user:promote -- <email>` (and removed by `npm run user:demote -- <email>`). No HTTP route accepts or changes a role. The role is read from the database on each request, so a demotion applies at once.
- **Session.** The cookie `sid` holds a random token; only its hash is stored in PostgreSQL. It is `HttpOnly`, `SameSite=Lax`, scoped to `/api`, `Secure` when `COOKIE_SECURE=true`, and lasts `SESSION_TTL_DAYS` (30) with no idle timeout. Login rotates it; logout and logout-all revoke it on the server.
- **CSRF and Origin.** Every state-changing browser request must carry the `X-CSRF-Token` header (from `GET /api/auth/csrf`) and an `Origin` equal to `FRONTEND_ORIGIN`; otherwise it gets 403.
- **Back office.** Everything under `/api/admin/*` is one plugin that requires a session and the `admin` role (401 for anonymous callers, 403 for buyers). The frontend route guards only improve the experience; the server enforces access.
- **Local flow.** After `npm run db:seed` an admin and a buyer account exist (the install skill prints both addresses). Open http://localhost:5173, enter the address, then read the code in the Mailpit inbox at http://localhost:8025 and enter it. The seed refuses to run with `APP_ENV=production`.

Configuration (names and local defaults in `.env.example`; the rules for each are checked at startup, which names the variable and never prints a value):

| Variable | Default | Secret | Notes |
|---|---|---|---|
| `FRONTEND_ORIGIN` | `http://localhost:5173` | no | The one allowed browser `Origin` for state-changing requests; scheme, host and optional port, no path. Production requires it to be set, `https` and not localhost |
| `AUTH_CODE_PEPPER` | local placeholder in `.env.example` | yes | At least 32 characters; production refuses the placeholder and injects its own |
| `CSRF_SECRET` | local placeholder in `.env.example` | yes | At least 32 characters; signs the CSRF cookie; production refuses the placeholder |
| `SMTP_PASS` | unset | yes | Set together with `SMTP_USER` in production only; never in a file |
| `SMTP_USER` | unset | no | Set together with `SMTP_PASS` |
| `EMAIL_PROVIDER` | `smtp` | no | `smtp` or `console`; `console` is for tests and is refused in production |
| `EMAIL_FROM` | a local no-reply address | no | Sender address |
| `SMTP_HOST`, `SMTP_PORT` | `localhost`, `1025` | no | Mailpit locally, SES SMTP in production |
| `AUTH_REQUEST_CODE_LIMIT` | `5` | no | Code requests per email in the window |
| `AUTH_REQUEST_CODE_WINDOW_MINUTES` | `15` | no | The window |
| `AUTH_REQUEST_CODE_COOLDOWN_SECONDS` | `60` | no | Minimum gap between two requests |
| `SESSION_TTL_DAYS` | `30` | no | Fixed session lifetime |
| `COOKIE_SECURE` | `false` | no | Must be `true` in production |

## Tests and verify

`npm run verify` runs the same steps as the GitHub Actions workflow (`.github/workflows/ci.yml`): database, lint, typecheck, tests, build and a security scan. During development `npm run verify-fast-part` is quicker; run `npm run verify-slow-part` (or the full `npm run verify`) on the final commit before pushing. Tests are written first, in Vitest for the workspaces and `node:test` for `scripts/`.

## Backend image

```sh
docker build -f backend/Dockerfile -t seatholder-backend .
```

The build context is the repository root. The image contains no `.env` or secret; configuration comes from environment variables at run time. CI also builds it for `linux/amd64` and `linux/arm64` without pushing, and its `image-smoke` job boots the amd64 image against PostgreSQL (`node scripts/image-smoke.mjs`, needs `IMAGE_SMOKE_DATABASE_URL`; `IMAGE_SMOKE_DOCKER_NETWORK` defaults to `host`).

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
