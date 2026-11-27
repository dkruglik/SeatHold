---
name: install-seathold
description: Installs and starts SeatHolder on a Mac from a fresh clone with Homebrew, without Docker. Use when the user asks to install, set up, or run SeatHolder on macOS, on a clean Mac, or invokes /install-seathold.
---

# Install SeatHolder on macOS

**Status: written and statically checked on Linux, not yet run on a Mac.** `scripts/install-skill.test.mjs` checks that every `npm run` command, `.env.example` key and repository path named here exists, and that the skill prints no secret. No timed run on a clean Mac has been recorded yet; see "Timed run".

Runs PostgreSQL 17 and Mailpit as Homebrew services (the exception in `.claude/rules/50-infrastructure.md`). Docker is not needed. The app reads the same `.env` keys as with Docker Compose. These are instructions for an agent, not a script: run the steps in order from the repository root.

## Rules for every step

- **Check first.** Each step starts with a check command. If the check already passes, say "already done" and go to the next step. Re-running the whole skill is safe.
- **Stop at the first failure.** Report what failed (the step, the command, the last lines of its output) and the fix command given in the step, then stop. Do not guess past a failure.
- **No secrets.** Never print `.env` contents, passwords or generated values. Read values into shell variables or pass them to `psql` as variables. The only logins to print are the seeded local ones in step 11.
- **Unsure about Homebrew or macOS behaviour?** Do not improvise: run the step's check command, show its output, and stop with the fix command.

## Steps

1. **Check the system.** Check: `uname -s` prints `Darwin`. Also note `uname -m` (`arm64` is Apple silicon, `x86_64` is Intel). Failure: the system is not macOS; stop, other systems use the Docker steps in `README.md`.
2. **Command line tools and Homebrew.** Check: `xcode-select -p` prints a path, and `command -v brew` prints a path. If the tools are missing, run `xcode-select --install` (it opens a dialog the person must accept), wait for it to finish, and run this step again. If `brew` is missing, install it without prompts: `NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`, then load it into this shell: `eval "$(/opt/homebrew/bin/brew shellenv)"` on Apple silicon, `eval "$(/usr/local/bin/brew shellenv)"` on Intel. Verify with `brew --version`. Fix on failure: install by hand from the Homebrew site, then re-run the skill.
3. **Packages.** Check: `brew list --versions node@24 postgresql@17 mailpit` prints a line for each of the three. Install only the missing ones: `brew install node@24 postgresql@17 mailpit`. Put Node 24 and the PostgreSQL 17 tools first on the path for this session: `export PATH="$(brew --prefix node@24)/bin:$(brew --prefix postgresql@17)/bin:$PATH"`. Verify: `node --version` starts with `v24`, `psql --version` shows 17. Fix on failure: `brew doctor`, then `brew install <package>` for the one that failed; `brew info node@24` prints the PATH line to add to the shell profile.
4. **Services.** Check: `pg_isready -h 127.0.0.1 -p 5432` prints "accepting connections", and `curl -fsS http://127.0.0.1:8025/readyz` succeeds (the Mailpit readiness endpoint; if it does not exist in the installed version, check `brew services list` shows `mailpit` as `started`). Start only what fails: `brew services start postgresql@17` and `brew services start mailpit`. Retry the checks every second for up to 30 seconds. Fix on failure: `brew services list` and the log of the failing service (`brew --prefix` plus `/var/log`), or another process holds the port; find it with `lsof -nP -iTCP:5432 -sTCP:LISTEN` (use 8025 or 1025 for Mailpit).
5. **Environment file.** Check: `test -f .env`. If missing, `cp .env.example .env`; never overwrite an existing `.env`. Then give the two local secrets real random values, only while they still hold the committed placeholder, without printing them: for each of `AUTH_CODE_PEPPER` and `CSRF_SECRET` run `grep -q "^$KEY=local-only" .env && sed -i '' "s|^$KEY=.*|$KEY=$(openssl rand -hex 32)|" .env` (BSD `sed` on macOS needs the empty `-i ''`). Fix on failure: copy `.env.example` to `.env` by hand and set those two keys to any random string of at least 32 characters.
6. **Role and database.** Read `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` from `.env` into shell variables with `grep` and `cut -d= -f2-` (do not echo them); `DATABASE_URL` in `.env` must name the same user, password and database. Check: `psql "$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" -tAc 'select 1'` prints `1`. If it fails, create what is missing through the Homebrew superuser (named after the macOS user, so it needs no password; check: `psql -h 127.0.0.1 -d postgres -tAc 'select 1'`, and fall back to the socket form `psql -d postgres` if the host form is refused). Pass the values as psql variables, with `-v ON_ERROR_STOP=1 -v u="$U" -v pw="$PW" -v d="$D"` and this on standard input:

```sql
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L CREATEDB', :'u', :'pw') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'u') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'d', :'u') WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'d') \gexec
```

   Run the check again. Fix on failure: make `DATABASE_URL` and the three `POSTGRES_` keys in `.env` agree, then re-run this step.
7. **Dependencies.** Check: `test -x node_modules/.bin/tsx && test -x node_modules/.bin/vite` and `test -d node_modules/.prisma || test -d node_modules/@prisma/client`. If the first check fails run `npm ci`; then always run `npm run db:generate` (it is fast and safe to repeat). Fix on failure: confirm `node --version` starts with `v24`, delete `node_modules`, run `npm ci` again.
8. **Migrate.** Check: none needed, `npm run db:migrate:deploy` applies only the migrations not yet applied in `backend/prisma/migrations` and prints that the database is up to date when there is nothing to do. Failure: the database is unreachable or `DATABASE_URL` is wrong; fix with step 6.
9. **Seed.** Check: the buyer already exists and the catalog is there, `psql "$(grep '^DATABASE_URL=' .env | cut -d= -f2-)" -tAc 'select count(*) from seats'` prints `40000` (the table name comes from `backend/prisma/schema.prisma`; if the query errors, run the seed anyway). Otherwise run `npm run db:seed`: it creates `admin@seathold.local` (admin) and `buyer@seathold.local` (buyer) when missing, then the demo catalog. Its last output line is `catalog inserted venues=<n> shows=<n> events=<n> seats=<n>`: expect `venues=12 shows=200 events=200 seats=40000` on a fresh database and zeros on a re-run. It refuses to run with `APP_ENV=production`. Failure: the catalog line is missing, or the counts differ on a fresh database; report the full output, and fix with `npm run seed:catalog` if only the catalog failed.
10. **Start.** Check: `curl -fsS http://localhost:5173/api/health` prints a body containing `"status":"ok"`; if so, already running, skip. Otherwise make sure nothing else holds the ports (`lsof -nP -iTCP:5173 -iTCP:3001 -sTCP:LISTEN`), then start in the background with the log and the process id outside the repository: `nohup npm run dev > "${TMPDIR:-/tmp}/seathold-dev.log" 2>&1 & echo $! > "${TMPDIR:-/tmp}/seathold-dev.pid"`. Poll the health URL every second for up to 60 seconds (the backend answers on `http://localhost:3001/api/health` first, then the frontend proxy on port 5173). Failure: print the last 30 lines of the log (`tail -n 30 "${TMPDIR:-/tmp}/seathold-dev.log"`), stop the process, and say which URL did not answer. Fix: free the port, or correct the setting the log names, then re-run step 10.
11. **Report.** Print: app http://localhost:5173, health http://localhost:5173/api/health, mail inbox http://localhost:8025. Print both seeded local logins: `admin@seathold.local` (admin) and `buyer@seathold.local` (buyer). Say that the catalog is seeded (200 shows, 40,000 seats). Say that login is by emailed code: enter the address on the login page, then read the code in the Mailpit inbox at http://localhost:8025. Say that a guest ticket link also lands in that inbox, that the admin pages are under `/admin`, that payment is a mock, and that `npm run user:promote -- <email>` and `npm run user:demote -- <email>` change roles. Print the "Demo script" below and how to stop ("Stop and clean up").

## Demo script

Tell the person to follow these in the browser at http://localhost:5173.

1. **Log in as the buyer.** Open `/login`, enter `buyer@seathold.local`, request the code, open the Mailpit inbox at http://localhost:8025, copy the code from the newest message and enter it.
2. **Search.** On `/` search for a show or a venue, open one result: the seat map is at `/events/<id>`.
3. **Hold seats and pay.** Click a few free seats; they are held for 10 minutes and the countdown shows. In the checkout panel choose "Test payment" succeed and pay (choose fail first to see that the hold stays and a retry works).
4. **My bookings.** Open `/bookings`: each ticket shows a QR code for the seats just bought.
5. **Admin and guest.** Log out, log in as `admin@seathold.local` the same way, open `/admin`, create an event, open an event to see its tickets, and release a held seat. Then log out and buy seats as a guest with any email address; open Mailpit, open the message and follow the link to see the tickets.

## Timed run

Target: the whole skill from a fresh clone on a clean Mac in < 10 minutes, including the Homebrew downloads. That time has not been measured yet. A person must do the first timed run on a clean macOS user or VM, write down the start and end time and every fix they had to make, and then change the status line at the top of this file. Until then do not claim a measured time.

## Stop and clean up

- Stop the app: `kill "$(cat "${TMPDIR:-/tmp}/seathold-dev.pid")"` (check the process first with `ps -p "$(cat "${TMPDIR:-/tmp}/seathold-dev.pid")"`), or end the terminal running `npm run dev`.
- Stop the services: `brew services stop postgresql@17` and `brew services stop mailpit`.
- Remove local data only when the person asks: `dropdb -h 127.0.0.1 "$D"` for the database, `rm .env` for the settings. Never remove them on your own.

## Notes

- The static check (`scripts/install-skill.test.mjs`) covers `npm run` scripts, `.env.example` keys and repository paths only; the brew, curl and psql steps have never run on a Mac.
- Ports 5173, 3001, 5432, 1025 and 8025 must be free on the loopback interface.
- The installed commands are the same as in `README.md` under "Run on a Mac without the install skill".
