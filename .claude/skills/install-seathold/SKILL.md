---
name: install-seathold
description: Installs and starts SeatHolder on a Mac from a fresh clone with Homebrew, without Docker. Use when the user asks to install, set up, or run SeatHolder on macOS, on a clean Mac, or invokes /install-seathold.
---

# Install SeatHolder on macOS

**v0, not yet run on a clean Mac.** It was written on a Linux host and has not been tested. Phase 5 does the timed clean-Mac run and completes it (the final demo script). The Phase 2 catalog seed is included below but has not been timed on a Mac either.

Runs PostgreSQL 17 and Mailpit as Homebrew services (the exception in `.claude/rules/50-infrastructure.md`). Docker is not needed. The app reads the same `.env` keys as with Docker Compose. Run the steps from the repository root, stop at the first failure and report it with the command output. Never print `.env` contents.

## Steps

1. **Check the system.** `uname -s` must print `Darwin`. If not, stop: this skill is for macOS; other systems use the Docker steps in `README.md`.
2. **Homebrew.** If `command -v brew` finds nothing, install it without prompts: `NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`, then load it into this shell: `eval "$(/opt/homebrew/bin/brew shellenv)"` on Apple silicon, `eval "$(/usr/local/bin/brew shellenv)"` on Intel.
3. **Packages.** `brew install node@24 postgresql@17 mailpit`. Put Node 24 first on the path for this session: `export PATH="$(brew --prefix node@24)/bin:$(brew --prefix postgresql@17)/bin:$PATH"`. Check `node --version` starts with `v24`.
4. **Services.** `brew services start postgresql@17` and `brew services start mailpit`. Wait until `pg_isready -h 127.0.0.1 -p 5432` succeeds (retry for up to 30 seconds).
5. **Environment file.** If `.env` does not exist, `cp .env.example .env`. Do not overwrite an existing `.env`.
6. **Role and database.** Read `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` from `.env` (the `DATABASE_URL` must match them). Create them only if missing, through `psql -h 127.0.0.1 -d postgres`: `CREATE ROLE <user> LOGIN PASSWORD '<password>' CREATEDB;` and `CREATE DATABASE <db> OWNER <user>;`. Homebrew PostgreSQL has a superuser named after the macOS user, so no password is needed for this step. Do not echo the password.
7. **Dependencies.** `npm ci`, then `npm run db:generate`.
8. **Migrate.** `npm run db:migrate:deploy` applies every migration in `backend/prisma/migrations` (Phase 1 added the auth schema, Phase 2 the catalog and booking schema).
9. **Seed.** `npm run db:seed` creates `admin@seathold.local` (admin) and `buyer@seathold.local` (buyer) when they are missing, then the demo catalog: 12 venues, 200 shows, 200 events and 40,000 seats. Its last output line is `catalog inserted venues=<n> shows=<n> events=<n> seats=<n>`; expect `venues=12 shows=200 events=200 seats=40000` on a fresh database and zeros on a re-run. It is safe to repeat and refuses to run with `APP_ENV=production`. If the catalog line is missing or the counts are not those numbers on a fresh database, stop and report it.
10. **Start.** Run `npm run dev` in the background, logging to a file outside the repository. Poll `curl -fsS http://localhost:5173/api/health` (and `http://localhost:3001/api/health` for the backend alone) every second for up to 60 seconds. If it never answers, print the last 30 log lines and stop.
11. **Report.** Print: app http://localhost:5173, health http://localhost:5173/api/health, mail inbox http://localhost:8025. Print both logins: `admin@seathold.local` (admin) and `buyer@seathold.local` (buyer). Say that the catalog is seeded (200 shows, 40,000 seats) and that the booking API is reachable under `/api/events` (there is no booking UI until Phase 3). Say that login is by emailed code: request a code on the login page, then read it in the Mailpit inbox at http://localhost:8025. Say that `npm run user:promote -- <email>` and `npm run user:demote -- <email>` change roles. Say how to stop: end the `npm run dev` process; `brew services stop postgresql@17 mailpit` stops the services.

## Notes

- Re-running is safe: every step checks before it creates.
- Ports 5173, 3001, 5432, 1025 and 8025 must be free on the loopback interface.
