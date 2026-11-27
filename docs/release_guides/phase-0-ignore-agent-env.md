# Release guide: Phase 0 setup (runnable skeleton, local stack, image, CI)

Branch: `feature/phase-0-ignore-agent-env` · MR: not opened yet · Plan: `plans/phase_0_setup.plan.md` it-0 to it-7 · Date: 2026-11-26

Placeholders used below: none. Every command runs as written from the repository root. Docker commands use the host's own Docker; ports are loopback only.

This branch deploys nothing. The design targets AWS (ECS Fargate, RDS Proxy, CloudFront, SES), but no AWS resource exists in Phase 0 and the README has no AWS commands. "Deploy" here means: merge, then run the checks below on a clean checkout.

## What changes for users

Nobody outside the development team notices anything. There is no product feature yet.

A developer (or the next phase) gets a runnable skeleton: npm workspaces, a Fastify backend that answers `GET /api/health`, a React, Vite and Mantine frontend on the same `/api` origin, a local Docker Compose stack (PostgreSQL 17.12, Mailpit v1.34.0), a backend container image, and a GitHub Actions workflow that replaces the GitLab pipeline. A macOS install skill (v0) is added; it has not been run on a Mac.

## Before deploy

1. Make sure Docker with Compose and Node 24 (see `.nvmrc`) are installed on the machine that runs the checks.
2. Create the local environment file from the example (it holds non-secret local values only):

```bash
cp .env.example .env
```

3. Push the branch to GitHub so that the workflow `.github/workflows/ci.yml` can run (it runs on pull requests and on pushes to `main`).

### Environment variables

All variables are read by `backend/src/config/load-config.ts` (backend) or the frontend config; `.env.example` lists every one. A wrong value stops the backend at startup with a message that names the variable and never its value.

| Variable | Value for production | Where | Required | Notes |
|---|---|---|---|---|
| `APP_ENV` | `production` | production env | no (default `local`) | `local` or `production`. Production refuses a local-only `FRONTEND_ORIGIN`. |
| `BACKEND_HOST` | `0.0.0.0` | production env | no (default `0.0.0.0` in code; `127.0.0.1` in `.env.example`; the image sets `0.0.0.0`) | Listen address. |
| `BACKEND_PORT` | `3001` | production env | no (default `3001`) | 1 to 65535. The image health check and `EXPOSE` use the build value of the same name (default 3001). |
| `DATABASE_URL` | the RDS Proxy URL, a `postgresql://` URL | secret store (AWS Secrets Manager or SSM Parameter Store), injected as task environment | yes | Secret: it carries the database password. Not assigned for production in any file. `.env.example` holds only a local placeholder for the Compose database. |
| `DATABASE_POOL_MAX` | `10` | production env | no (default `10`) | Integer 1 to 100. Instances times this value must stay under the RDS Proxy and PostgreSQL limits. |
| `LOG_LEVEL` | `info` | production env | no (default `info`) | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`. |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | production env | no (default `10000`) | Positive integer. Keep it below the container stop timeout. |
| `FRONTEND_ORIGIN` | the public https origin of the site | production env | yes in production | Scheme, host and optional port, no path. In production it must be set, `https`, and not `localhost`, `127.0.0.1` or `[::1]`. Default in local: `http://localhost:5173`. |
| `VITE_API_BASE_URL` | `/api` | frontend build env | no | Public, read at frontend build time. Never put a secret in a `VITE_` variable. |
| `POSTGRES_USER` | not used in production | local `.env` only | no (default `seatholder`) | Docker Compose only (`docker-compose.yml`). |
| `POSTGRES_PASSWORD` | not used in production | local `.env` only | no (default `seatholder`) | Docker Compose only; local placeholder, not a secret. |
| `POSTGRES_DB` | not used in production | local `.env` only | no (default `seatholder`) | Docker Compose only. |

Local `.env`: already created by the `cp` command in "Before deploy", with these values:

```bash
cat .env
```

Expected: the lines of `.env.example` (`APP_ENV=local`, `BACKEND_PORT=3001`, `DATABASE_URL=postgresql://seatholder:seatholder@localhost:5432/seatholder`, and the rest). If the file is missing, run the `cp` command again.

Secrets: the only new secret is `DATABASE_URL` for production. Nothing is deployed, so nothing is stored yet. When production exists, put the real URL into the secret store, one key `DATABASE_URL`, and never into `.env`.

### Other requirements

1. The GitHub repository must allow Actions. The workflow needs no secret and no registry: the image is built and never pushed.
2. The `image-build` job needs QEMU and Buildx, which the workflow sets up itself on the hosted runner. The `image-smoke` job needs only Docker and a `postgres:17.12` service container, both on the hosted runner.
3. The repository on GitHub has Actions enabled, and the workflow passed on main after the merges (owner-confirmed, 2026-11-27). deferred to deploy (not deployed by this project): who reads the workflow results.

## Deploy

Nothing is deployed to AWS. The release is the merge of the branch to `main`. Merging triggers the GitHub Actions workflow on `main`.

Build the backend image locally (the build context is the repository root):

```bash
docker build -f backend/Dockerfile -t seatholder-backend .
```

Expected: the last line is `Successfully tagged seatholder-backend:latest` (or `naming to docker.io/library/seatholder-backend` with BuildKit).

Image facts: it runs as user `node`, listens on `BACKEND_PORT` (default 3001, all interfaces), health check `GET /api/health`, and stops gracefully on SIGTERM within `SHUTDOWN_TIMEOUT_MS`. It contains no `.env` and no secret.

The frontend is a static Vite build (`npm run build`); it is not published anywhere in Phase 0.

### Migrations

None. `backend/prisma/` holds `schema.prisma` (datasource and generator only) and `seed.ts`; there is no `migrations/` directory. The first migration arrives in Phase 1. `npm run db:migrate:deploy` therefore has nothing to apply.

No manual data steps.

## After deploy: check the feature

Run these on a clean checkout of the merged branch.

### 1. The local stack starts

**Action:** starts the Compose containers (PostgreSQL and Mailpit, loopback ports 5432, 1025 and 8025). Safe: it only creates containers and a named volume, and it changes nothing else.

```bash
docker compose up -d --wait
docker compose ps
```

Expected: `postgres` and `mailpit` show `Up ... (healthy)`. If `postgres` is not healthy, run `docker compose logs postgres` and check that port 5432 is free.

### 2. Dependencies and Prisma client

**Action:** installs `node_modules` and writes the generated Prisma client (git-ignored). Safe: nothing outside the repository changes.

```bash
npm ci
npm run db:generate
```

Expected: `npm ci` finishes without errors; the second command prints `Generated Prisma Client (7.10.1) to ./src/generated/prisma`.

### 3. The full fast verify passes

```bash
npm run verify-fast-part
```

Expected: the summary lists every step as `PASS` (database start, `db:generate`, AI-rule sync check, lint and typecheck for both workspaces, backend and frontend unit tests, script tests, fast integration tests, both builds, security scan) and the last line is `verify-fast-part passed`. Before the push, also run the slow part on the same commit:

```bash
npm run verify-slow-part
```

Expected: every step `PASS` and `verify-slow-part passed`. (At the time of writing, `verify-slow-part` was not run for this guide.)

### 4. The backend image runs against PostgreSQL

**Action:** starts one container named `seatholder-backend-check` on the Compose network, with the port published on loopback. Safe: it is removed at the end and touches no other container.

```bash
docker compose up -d --wait postgres
docker run -d --name seatholder-backend-check --network seatholder_default -p 127.0.0.1:3001:3001 -e DATABASE_URL=postgresql://seatholder:seatholder@postgres:5432/seatholder seatholder-backend
for i in $(seq 1 30); do curl -sf localhost:3001/api/health && break; sleep 1; done
echo
```

Expected: `{"status":"ok"}`. If nothing prints, run `docker logs seatholder-backend-check`: a `Invalid configuration: <VARIABLE> ...` line names the wrong variable.

(`seatholder_default` is the Compose network of a checkout in a directory named `seatholder`. In another directory name, read it with `docker network ls --format '{{.Name}}' | grep _default`. Port 3001 must be free; change both numbers of `-p` and pass `-e BACKEND_PORT=<port>` to use another.)

Container health and user:

```bash
docker inspect -f '{{.State.Health.Status}}' seatholder-backend-check
docker exec seatholder-backend-check id -un
```

Expected: `healthy` (after the 20 s start period at most), then `node`.

Graceful stop:

```bash
docker stop seatholder-backend-check
docker inspect -f 'exit={{.State.ExitCode}}' seatholder-backend-check
docker logs seatholder-backend-check 2>&1 | grep -E 'shutdown (started|complete)'
docker rm seatholder-backend-check
```

Expected: `docker stop` exits 0, `exit=0`, and the log has the two messages `shutdown started` and `shutdown complete`. If `docker stop` takes about 10 seconds and the exit code is not 0, the shutdown hung: report it.

### 5. The app runs on the host (optional)

```bash
npm run dev
```

In another terminal:

```bash
curl -s localhost:5173/api/health
```

Expected: `{"status":"ok"}` (the Vite dev server proxies `/api` to the backend). The browser app is at `http://localhost:5173` and the Mailpit inbox at `http://localhost:8025`. Stop `npm run dev` with Ctrl+C.

### 6. The GitHub Actions run

Open the Actions tab of the repository, workflow `CI`, and read the run of the pull request.

Expected: all seven jobs green: `lint-typecheck`, `test`, `build`, `image-build` (amd64 and arm64), `image-smoke` (boots the amd64 image against PostgreSQL: health, non-root, clean SIGTERM exit, fail-fast on an invalid `BACKEND_PORT`), `security-semgrep`, `security-audit`. This has not happened yet: the workflow has never run on GitHub. If a job is red, open it, read the failing step, and fix it before the merge; do not skip it.

### SQL checks

None. There are no tables in Phase 0. To confirm the database is reachable and has no application tables yet:

```bash
docker compose exec postgres psql -U seatholder -d seatholder -c "SELECT count(*) AS application_tables FROM information_schema.tables WHERE table_schema = 'public';"
```

Expected: `application_tables` is `0`.

### Scheduler checks

None. Phase 0 adds no scheduler or background job.

### Local clean-up

**Action:** stops and removes the Compose containers; the named volume `postgres-data` stays (add `-v` to delete it, which drops the local database).

```bash
docker compose down
```

## Rollback

Nothing is deployed, so there is nothing to roll back in an environment. To undo the merge, revert the merge commit on `main`. There are no migrations and no data, so a revert loses nothing. To remove the local stack: `docker compose down -v`.

## Known limits

- The runtime image has neither the Prisma CLI nor migrations (DECISIONS.md O35); Phase 1 it-1 must add a one-off migration task or image stage. Deploy sets `APP_ENV=production` explicitly: an unset `APP_ENV` means `local` rules (O32).
- The GitHub workflow `.github/workflows/ci.yml` passed on main after the merges (owner-confirmed, 2026-11-27). The arm64 build is unproven on the development host (no buildx or QEMU there).
- The macOS install skill (`.claude/skills/install-seathold/`) is v0. The clean-Mac run was skipped by the owner's decision (2026-11-27, no Mac available); the skill is statically checked only, an accepted risk.
- deferred to deploy (not deployed by this project): the Agent Manager review of this branch (agent SH-cursor) ended `blocked` (input-required) and was replaced by an in-session review. Decide whether a second review is needed.
- Decisions in `DECISIONS.md`: O14 is `implemented` (the workflow passed on main, owner-confirmed 2026-11-27); O13 is decided, with the clean-Mac run skipped as an accepted risk; O3 stays `planned` until the arm64 image build is proven; O1 when the modules arrive from Phase 1.
- Not verified when this guide was written: `npm ci` on an empty checkout, `npm run verify-slow-part`, and the `curl` step from the host shell. In the writing environment the host loopback could not reach published container ports, so the health response was verified inside the container (`docker exec ... wget`), together with the container health status `healthy`, user `node` and `docker stop` exit 0. `npm run verify-fast-part` and `docker compose up -d` (stack healthy) were run and passed.
- README sections for these steps: "Run on Windows or Linux (Docker)", "Scripts", "Tests and verify" and "Backend image" in `README.md`.
