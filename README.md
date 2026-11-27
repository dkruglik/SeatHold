# SeatHolder

SeatHolder is a ticketing system for events with numbered seats (the "SeatHold" brief). Buyers pick seats and hold them for a short time, then pay with a mock payment; guests reach their tickets through a link; admins manage events. Seat holds are decided in PostgreSQL so that several backend instances agree. The design is for AWS, but nothing is deployed.

Status: Phase 3 (buyer flow) on top of Phase 2 (booking core), Phase 1 (auth and access) and Phase 0 (setup). The backend serves a seeded catalog with search, holds seats, expires holds, takes a mock payment, issues guest links and logs users in by emailed code with buyer and admin roles. The frontend covers search, the seat map, checkout, My bookings and the guest ticket page. The back office UI is Phase 4. The plan is in [`plans/seatholder_product_roadmap.plan.md`](plans/seatholder_product_roadmap.plan.md) and every design decision and trade-off is in [`DECISIONS.md`](DECISIONS.md).

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
| `npm run db:seed` | Creates the local admin and buyer accounts and the demo catalog (venues, shows, events, seats) if missing; safe to repeat; refuses to run with `APP_ENV=production` |
| `npm run seed:catalog` | Loads only the fictional demo catalog (12 venues, 200 shows, 200 events, 40,000 seats); creates no users; safe to repeat; allowed in production for demo deployments, where the compiled form is `node backend/dist/scripts/seed-catalog.js` (the image has no `tsx`); takes no arguments (exit 2) |
| `npm run sweep:holds -- --batch-size=<1-10000>` | Development and local only (needs the dev dependencies, so it does not work in the production image; there run `node backend/dist/scripts/sweep-holds.js --batch-size=<n>`). Runs the hold sweeper once (default batch size 500) and prints `holds swept freedSeats=<n> expiredHolds=<n>`; exit code 2 on bad arguments; allowed in production; optional, because expiry is lazy |
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
| `HOLD_DURATION_MINUTES` | `10` | no | How long a seat hold lasts (positive integer) |
| `MAX_SEATS_PER_HOLD` | `10` | no | Most seats in one hold (positive integer) |
| `DEFAULT_CURRENCY` | `EUR` | no | Three uppercase letters (ISO 4217) |
| `GUEST_LINK_TTL_HOURS` | `168` | no | How long a guest access link works (positive integer) |
| `GUEST_RESEND_LIMIT` | `3` | no | Guest link resends per email address in the window (positive integer) |
| `GUEST_RESEND_WINDOW_MINUTES` | `60` | no | The resend window (positive integer) |
| `VITE_SEAT_POLL_INTERVAL_MS` | `3000` | no (public, frontend) | How often the event page polls seat status (positive integer) |

## Booking

Phase 2 built the backend: the catalog, the seat hold, expiry and the mock checkout. Phase 3 adds the screens on top (see Buyer flow). A seat is never sold twice: holding a seat is one conditional `UPDATE` in PostgreSQL (`status = 'available'` or an expired hold), zero rows means 409, and `UNIQUE(seat_id)` on tickets is the backstop. Holds expire lazily: every read and write treats a hold past its `expires_at` as free, so nothing depends on a background job (a sweeper exists, and `node backend/dist/scripts/sweep-holds.js` runs it once in production, `npm run sweep:holds` in development, but nothing schedules it). Time comes from the injected clock, read once per operation. The reasoning is in `DECISIONS.md` (D1, D2, D4, D6, O58 to O69; the buyer flow is O70 to O82).

**Seed.** `npm run db:seed` prints one line per account and then the catalog line:

```text
catalog inserted venues=12 shows=200 events=200 seats=40000
```

The numbers are the rows created by that run, so a second run prints zeros. The catalog is 12 venues in 5 countries, 200 shows and one event per show in the next 90 days, each with a 10 x 20 seat grid (200 seats). It is deterministic apart from the start times.

**Catalog in production.** `db:seed` refuses to run with `APP_ENV=production`. A demo deployment loads the same fictional catalog, and no user, with `node backend/dist/scripts/seed-catalog.js` (`npm run seed:catalog` in development); it prints the same line, is safe to repeat and exits 2 on any argument. A real deployment gets its events from the back office (Phase 4); no import-from-file command exists (DECISIONS.md O69).

**Sweeping expired holds.** Expiry never needs it, but `node backend/dist/scripts/sweep-holds.js --batch-size=500` (the compiled script, which is what the production image runs; `npm run sweep:holds -- --batch-size=500` is the development equivalent and needs the dev dependencies) frees the seats of expired holds once and prints `holds swept freedSeats=<n> expiredHolds=<n>`. It is safe to repeat and to run beside the app. The repository does not schedule it; production would run it as a one-off task (DECISIONS.md O64).

**Who is booking.** A signed-in user holds seats as the user. Anyone else gets a random `vid` cookie on the first hold (`HttpOnly`, `SameSite=Lax`, scoped to `/api`, 30 days; only its hash is stored). After login, the next booking request moves the visitor's holds to the user and clears the cookie. A person can only release or pay for their own hold; another person's hold answers 404.

| Route | Who | Answers |
|---|---|---|
| `GET /api/events/:eventId/seats` | anyone | 200 `{ event: { id, priceMinor, currency }, seats: [{ id, row, number, state }] }`, `state` is `available`, `held` or `sold`; the same for every viewer, `Cache-Control: public, max-age=1`; 404 `EVENT_NOT_FOUND` |
| `PUT /api/events/:eventId/hold/seats/:seatId` | user or visitor (cookie issued if missing); CSRF | 200 `{ seatIds, expiresAt }`; 409 `SEAT_UNAVAILABLE` or `HOLD_LIMIT_REACHED` |
| `DELETE /api/events/:eventId/hold/seats/:seatId` | the holder; CSRF | 204; 404 `HOLD_NOT_FOUND` |
| `GET /api/events/:eventId/hold` | the holder | 200 `{ seatIds, expiresAt }`; 404 `HOLD_NOT_FOUND`; never cached |
| `POST /api/events/:eventId/hold/checkout` | the holder; CSRF | body `{ paymentOutcome: "succeed" or "fail", guestEmail? }`; 201 the booking with one ticket code per seat; 400 `GUEST_EMAIL_INVALID` (a visitor needs a valid `guestEmail`); 402 `PAYMENT_FAILED` (the hold stays, the buyer can retry); 404 `HOLD_NOT_FOUND`; 409 `HOLD_EXPIRED` (the hold lapsed, also while the payment was authorizing, and the payment is voided) |

Holding a seat adds it to the holder's single hold for the event; all seats share the expiry set at the first click. Mutating routes need the `X-CSRF-Token` header and the allowed `Origin` (see Authentication). Error bodies are `{ "error": { "code", "message" } }`. The mock payment returns whichever outcome the buyer picked in `paymentOutcome`; no card data exists anywhere.

Configuration: `HOLD_DURATION_MINUTES` (10), `MAX_SEATS_PER_HOLD` (10) and `DEFAULT_CURRENCY` (`EUR`) are in the table under Authentication and in `.env.example`.

**The two proof tests** need a database, so run them through the test-database wrapper from the repository root, with PostgreSQL running (`npm run db:start`). The wrapper creates a throwaway database, migrates it, runs the command and drops it:

```sh
node scripts/test-db.mjs run -- npm run test:integration -w backend -- prisma-hold-repository.hold-concurrency
node scripts/test-db.mjs run -- npm run test:integration -w backend -- prisma-hold-repository.kpi-expiry
```

The first runs 100 parallel holds on one seat and expects exactly one winner. The second moves a controlled clock past the hold duration and expects the seat to be on sale again, with no real waiting. Both are in `backend/src/modules/booking/infrastructure/persistence/` and run in `npm run verify`.

## Buyer flow

The flow is search, seat map, hold, pay, ticket. Everything below runs in the browser at http://localhost:5173 after the Docker or Mac setup above.

1. **Search** (`/`). Filter by text, type, genre, country, city, venue and a date-time range. The filters live in the URL, so a search can be shared or reloaded. Only upcoming events are listed unless a range starts earlier.
2. **Seat map** (`/events/:eventId`). Click free seats to hold them (up to `MAX_SEATS_PER_HOLD`); a countdown shows the rest of the `HOLD_DURATION_MINUTES` window. The map refreshes every `VITE_SEAT_POLL_INTERVAL_MS` while the tab is visible. Click a seat of yours to release it.
3. **Pay.** The checkout panel pays with the mock gateway: the "Test payment" choice decides whether it succeeds or fails, and no card data exists. A failed payment keeps the hold for a retry; an expired hold shows a message.
4. **Ticket.** A signed-in buyer finds bookings under My bookings (`/bookings`), each ticket with a QR code (payload `SEATHOLD:<code>`). A guest enters an email instead of signing in; after payment the confirmation says to check the email, and the emailed link opens the tickets once. The link works for `GUEST_LINK_TTL_HOURS` and is exchanged for a session cookie that shows that one booking until the event starts plus one day. A lost link is replaced on the same page with the "send me a new link" form (limited by `GUEST_RESEND_LIMIT` per `GUEST_RESEND_WINDOW_MINUTES`).

Try the guest path locally: `docker compose up -d` (or the Homebrew services) starts Mailpit; buy seats while signed out with any address, open http://localhost:8025, open the message and follow the link. The link ends in `#t=<token>`; the page removes the token from the address bar at once and uses it a single time. A corrupted or too-short link (a 400 from the exchange) is shown as "This link is not valid" with the resend form, not as a server error.

| Route | Who | Answers |
|---|---|---|
| `GET /api/shows` | anyone | One row per event with `seatsLeft`; query `q`, `type`, `genre`, `country`, `city`, `venueId`, `from`, `to`, `page`, `pageSize` (max 50, default 20); unknown parameters 400; `{ items, total, page, pageSize, totalPages }`; `public, max-age=1` |
| `GET /api/shows/facets` | anyone | Values for the filter lists (types, genres, countries, cities, venues) that have an upcoming event; `public, max-age=60` |
| `GET /api/events/:eventId` | anyone | Show, venue, start and price; 400 for a malformed id, 404 `EVENT_NOT_FOUND`; `public, max-age=1` |
| `GET /api/me/bookings` | signed in | The caller's confirmed bookings (newest first, at most 100) with ticket codes; 401 `UNAUTHENTICATED`; `no-store` |
| `POST /api/guest/exchange` | anyone; CSRF | Body `{ token }` (20 to 200 characters; a malformed token is 400); sets the `gsid` cookie and returns the booking, the link being consumed and the session created in one statement; 410 `LINK_USED`, `LINK_EXPIRED` or `LINK_INVALID` |
| `GET /api/guest/booking` | guest session | The one booking with its tickets; 401 `UNAUTHENTICATED` |
| `POST /api/guest/resend` | anyone; CSRF | Body `{ email }`; 204 whether or not bookings exist; 429 `RATE_LIMITED` with a `Retry-After` header and `retryAfterSeconds` in the body |

| Frontend route | Screen |
|---|---|
| `/` | Search and results |
| `/events/:eventId` | Event page: seat map, hold, checkout |
| `/bookings` | My bookings with QR codes (sign-in required) |
| `/guest/access` | Guest ticket page (reads the link fragment) and the lost-link form |

The guest session cookie `gsid` and the user session cookie `sid` are separate and never accepted for each other's routes. The decisions and their trade-offs are `DECISIONS.md` O70 to O82 (and D5). Known limits: the payment is a mock whose outcome the client chooses (do not expose it to real customers), the seat countdown uses the browser clock, search matches whole words and venue substrings only, and rows of used guest links and resend attempts are not purged yet.

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
