# SeatHolder

SeatHolder (the "SeatHold" brief) is a ticket-ordering platform for events with numbered seats. A buyer finds a show, holds seats on a seat map for a limited time and pays inside the window with a mock payment; guests get their tickets through an emailed link; admins create events and release stuck holds. A seat is never sold twice: holds are decided in PostgreSQL, so several backend instances agree. The design targets AWS, but nothing is deployed.

Status: Phases 0 to 4 (setup, auth and access, booking core, buyer flow, back office) are built and merged. Phase 5 (deliverables: this README, the install skill, the remaining `DECISIONS.md` entries, the AI workflow write-up) is in progress (README, decisions and AI workflow done; the timed install run on a Mac and the final verify with the manual end-to-end are open). Phase 6 (design system depth: theme, shared UI layer, picker and seat map extensions, responsive pass) is built on branch `feature/phase-6-design-system`; open: a check on real devices, the dark-scheme first paint (no `ColorSchemeScript` yet) and the external review. The plan is [`plans/seatholder_product_roadmap.plan.md`](plans/seatholder_product_roadmap.plan.md); every design decision and trade-off is in [`DECISIONS.md`](DECISIONS.md).

## Contents

- [Quick start](#quick-start)
- [How it works in one page](#how-it-works-in-one-page)
- [Scripts](#scripts)
- [Authentication](#authentication)
- [Booking](#booking)
- [Buyer flow](#buyer-flow)
- [Frontend and UI](#frontend-and-ui)
- [Admin back office](#admin-back-office)
- [Tests and verify](#tests-and-verify)
- [Install skill](#install-skill)
- [AI tooling](#ai-tooling)
- [What was cut](#what-was-cut)
- [Backend image](#backend-image)
- [Repository layout](#repository-layout)

## Quick start

Requirements: Node 24 (version in `.nvmrc`) and npm. Windows and Linux use Docker with Compose for PostgreSQL 17 and Mailpit; a Mac can use Homebrew services instead.

### Windows or Linux (Docker)

```sh
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
docker compose up -d
npm ci
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run dev
```

Stop the database and mail catcher with `docker compose down` (or `npm run db:stop`).

### Mac (Homebrew, without the install skill)

The [install skill](#install-skill) automates these steps. By hand:

```sh
brew install node@24 postgresql@17 mailpit
brew services start postgresql@17
brew services start mailpit
cp .env.example .env
```

Create the role and database named by `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` in `.env` (defaults: all `seatholder`) so that `DATABASE_URL` works, then run `npm ci`, `npm run db:generate`, `npm run db:migrate:deploy`, `npm run db:seed` and `npm run dev`. The app reads the same `.env` keys as with Docker; it cannot tell the two setups apart. Make sure `node@24` is first on your `PATH` (`brew info node@24` prints the line to add).

### URLs and logins

- App: http://localhost:5173
- Health check: http://localhost:5173/api/health (the Vite dev server proxies `/api` to the backend on port 3001, so the browser sees one origin)
- Mail inbox (Mailpit): http://localhost:8025

`npm run db:seed` creates two accounts on the local domain `seathold.local`: an admin with the local part `admin` and a buyer with the local part `buyer` (so `admin`, `buyer`, then `@seathold.local`), plus the demo catalog. There are no passwords.

### Login by emailed code

Open the app, choose sign in, enter a seeded address and submit. The backend sends a six-digit code over SMTP to Mailpit; open http://localhost:8025, open the message and type the code into the app. Any other address works too and creates a buyer. Details under [Authentication](#authentication).

### Demo path in five lines

1. Open http://localhost:5173 and search (for example by city or genre); open an event.
2. Click free seats on the map; they are held and a countdown starts (10 minutes).
3. Pay with the mock "Test payment" (succeed); signed out, give an email address and open the link from Mailpit, or sign in and open My bookings.
4. See the ticket with its QR code.
5. Sign in as the seeded admin, open "Back office" in the user menu (`/admin`), create an event or release a held seat.

## How it works in one page

- **Modular monolith.** One Fastify backend with modules (auth, catalog, booking, guest access, back office) split into presentation, application, domain and infrastructure layers; routes are thin and call application services. One React app (Vite, Mantine).
- **Stateless instances.** No session, hold or rate-limit state in process memory and no local disk writes, so any number of identical instances can run behind a load balancer.
- **PostgreSQL is the only shared state.** Sessions, login codes, holds, tickets and rate-limit counters all live there.
- **Locking.** Holding a seat is one conditional `UPDATE` (`status = 'available'` or an expired hold); zero rows means 409. `UNIQUE(seat_id)` on tickets is the backstop. No check-then-write in application code (DECISIONS D1).
- **Database time, lazy expiry.** Each operation reads the clock once, from the database in production (the `Clock` port; tests inject a controlled clock). Holds expire lazily: a hold past its expiry counts as free in every read and write, so nothing depends on a background job (D2, O4).
- **One origin under `/api`.** The API is served on the frontend's origin (Vite proxy locally, CloudFront path routing in the AWS design), so session cookies are first-party and CORS stays closed (O5). State-changing requests need a CSRF token and an allowed `Origin`.
- **Configuration only from environment**, validated at startup by one typed config module; `.env.example` lists every variable.
- **AWS target (designed, not deployed).** CloudFront and S3, ECS Fargate behind an ALB, Aurora PostgreSQL 17 with RDS Proxy, SES, Secrets Manager, CloudWatch, WAF.
- **Where to read more.** Every decision, with options and trade-offs: [`DECISIONS.md`](DECISIONS.md) (locking, hold state, caching, late payment, guest link, data store, KPIs, security, scale for 100,000 visitors and 20,000 seats). Plans per phase: [`plans/`](plans/). Release and deploy steps per phase: [`docs/release_guides/`](docs/release_guides/README.md).

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
- **Local flow.** See [Quick start](#quick-start): enter the seeded address, read the code in Mailpit. The seed refuses to run with `APP_ENV=production`.

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

**Catalog in production.** `db:seed` refuses to run with `APP_ENV=production`. A demo deployment loads the same fictional catalog, and no user, with `node backend/dist/scripts/seed-catalog.js` (`npm run seed:catalog` in development); it prints the same line, is safe to repeat and exits 2 on any argument. A real deployment gets its events from the back office (see Admin back office); no import-from-file command exists (DECISIONS.md O69).

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

## Frontend and UI

The UI is Mantine behind our own layer in `frontend/src/shared/ui/`. Feature code imports only from that barrel (`shared/ui/index.ts`); `shared/ui/no-direct-mantine.test.ts` fails when a file under `features/` imports `@mantine/*` (O116). The layer has the wrappers `Button`, `Card`, `FilterBar`, `PageLayout` and `Pagination`, the components `DateTimeRangePicker`, `SeatMap`, `BookingCard`, `TicketQr` and `ColorSchemeToggle`, and re-exports the Mantine primitives the features use.

- **Theme** (`frontend/src/app/theme.ts`, `theme-components.ts`, `focus-ring.css`). Own palette, spacing and type scales, component defaults, a keyboard focus ring. Muted text and the focus ring are contrast-checked in `theme.test.ts` (WCAG AA); Mantine's default muted gray failed it and is replaced (O117).
- **Dark scheme.** The Light, Dark or Auto switch in the header stores only the preference string in the browser's localStorage. There is no `ColorSchemeScript` in `index.html` yet, so a stored dark preference can show one light frame on the first paint (accepted, O117).
- **Date-time range picker.** Presets (Tonight, This weekend, Next 7 days, Next 30 days), a time zone label (the `timeZone` prop, default the browser zone), the message "This range is already over" for a past range unless `allowPast`, and keyboard use (arrows move the day; Tab goes calendar, from time, to time, presets, Clear; Escape closes) (O118).
- **Seat map.** Row labels on both sides, a tooltip with seat, price and state, and keyboard navigation with one tab stop: arrow keys move between seats and rows, Home and End go to the first and last seat of the row, PageUp and PageDown go to the first and last row, Enter or Space holds or releases. A two-finger pinch zooms the map and a drag pans it (scale 1 to 3, not stored); the Zoom in, Zoom out and Reset view buttons show below 48em (O119).
- **Phone layout** (below 48em). A sticky bar with the countdown and the way on to payment on the event page, a compact account menu, a full-screen release dialog, and large touch targets for buttons, the pager and the zoom buttons. Text inputs and inline links keep their default size (O120).

Tests run in jsdom, which has no layout and no touch device: the phone layouts are tested at a controlled viewport width, and the pinch gesture only with synthetic pointer events.

## Admin back office

Operators work at `/admin` in the browser (the "Back office" link in the user menu shows for admins only). Everything is served by one Fastify plugin under `/api/admin`: anonymous callers get 401, buyers get 403, and every state-changing admin call also needs the CSRF token and an allowed Origin. The role is read from the database on each request.

| Route | What it does |
|---|---|
| `GET /api/admin/events` | Paginated event list with sold, held and available seat counts (default page size 20) |
| `POST /api/admin/events` | Creates an event and its whole seat grid (201) |
| `GET /api/admin/lookups` | Shows and venues for the create form (at most 500 of each) |
| `GET /api/admin/events/:eventId/open-tickets` | Seats not sold: available or held, paginated (default 50) |
| `GET /api/admin/events/:eventId/bought-tickets` | Sold tickets with buyer email, buyer type and booking time, paginated (default 50) |
| `POST /api/admin/events/:eventId/seats/:seatId/release` | Frees a held seat; body `{ "reason": "..." }` |

**Becoming admin.** Sign-up always creates a buyer. Locally the seed creates an admin; otherwise the person signs in once and you run `npm run user:promote -- <email>` (see Authentication). No HTTP route changes roles.

**What an operator can do.**

- Create an event from an existing or a new show and venue, with a start time, a price, a currency and a rows by seats-per-row grid. Rows are labelled A to Z, then AA; seats are numbered from 1. A new venue with the same name and city as an existing one is reused only if its country and time zone match; otherwise the answer is 409 `VENUE_CONFLICT`.
- See per event the open tickets (a hold that has run out counts as available) and the bought tickets.
- Release a held seat, for example when a buyer abandoned checkout on a call, or to clear a stale hold. A reason of 3 to 500 characters is required.

**Limits.**

- At most 20,000 seats per event (rows and seats per row 1 to 200), a price up to 1,000,000 minor units, a start time in the future and within 3 years. Bad input is 400 `INVALID_EVENT`.
- A release needs a reason and is logged in the `seat_release_log` table (who, which seat, which hold, the reason, the time). A second release of the same seat answers 409 `SEAT_NOT_HELD`. The reason is stored, never written to the application log. Only this action has an audit trail; a general admin audit log is a production addition.
- Buyer and guest emails appear only in admin responses. Ticket codes and payment details appear in no admin list.
- Admin lists are paged: `page` 1 to 100000, `pageSize` 1 to 100; unknown query parameters are 400. The total and the items are two reads, not one snapshot.

Reasoning: `DECISIONS.md` O83 to O109. Deploy and checks: [`docs/release_guides/phase-4-back-office.md`](docs/release_guides/phase-4-back-office.md).

## Tests and verify

`npm run verify` runs the same steps as the GitHub Actions workflow (`.github/workflows/ci.yml`): database, lint, typecheck, tests, build and a security scan. While iterating, `npm run verify-fast-part` runs everything except the `*.slow.test.ts` integration files (tests that wait on real time); `npm run verify-slow-part` runs only those. Before a push, the full `npm run verify` (or both parts) must pass on the final commit. Tests are written first, in Vitest for the workspaces and `node:test` for `scripts/`. Integration tests need PostgreSQL (`npm run db:start`) and run against a throwaway database created by `scripts/test-db.mjs`.

## Install skill

`.claude/skills/install-seathold/SKILL.md` is a Claude Code skill that installs and starts SeatHolder on a Mac from a fresh clone with Homebrew and no Docker: Homebrew, `node@24`, `postgresql@17` and `mailpit` as services, role and database, `.env`, `npm ci`, migrate, seed, start, wait for `/api/health`, then print the URLs and the seeded logins. Every step checks before it creates, so a re-run is safe. Use it by asking Claude Code on the Mac to install SeatHolder (or `/install-seathold`).

Honest status: the skill is written and statically checked (its commands are compared with `package.json`), but the timed clean-Mac run (target: under 10 minutes) has still to be done by a person. The by-hand Mac steps in [Quick start](#quick-start) are the fallback.

## AI tooling

SeatHolder was built with Claude Code. The engineering rules are in `.claude/rules/` (generated from `.cursor/rules/` by `node scripts/sync-ai-rules.mjs --write`; `npm run lint` fails on drift), the skills in `.claude/skills/`, and review agents come from the `review-suite` plugin. `CLAUDE.md` states the working rules. How AI was used, how its output was checked and where it was wrong: [`docs/ai-workflow-log.md`](docs/ai-workflow-log.md) and the "AI workflow" section of [`DECISIONS.md`](DECISIONS.md).

## What was cut

Cut or not built, checked against the code and the plans' "Out of scope" lists:

- **Real payment provider.** Payment is a mock whose outcome the client chooses; no card data exists. Refunds are not built either.
- **Live seat updates by SSE or WebSocket.** The event page polls every `VITE_SEAT_POLL_INTERVAL_MS` (3000 ms).
- **Email delivery in production.** The SMTP adapter (Mailpit locally, SES SMTP in the design) is the only real path and is configuration only; verifying the sender with SES is an operator task.
- **Admin audit log for all actions.** Only manual seat release is logged (`seat_release_log`).
- **Back-office extras.** No sales dashboard, event editing or cloning, price changes or CSV export.
- **AWS deployment and infrastructure as code.** Designed in `DECISIONS.md` and the roadmap, not built. The backend image builds in CI and is never pushed.
- **Load tests.** None; the scale section of `DECISIONS.md` is analysis, not measurement.
- **Caching layer.** Written in `DECISIONS.md` (D3), not built. Only short `Cache-Control` headers on public reads exist; there is no cache in the backend and no CDN.
- **Scheduled hold sweeper.** The sweeper script exists; nothing schedules it, because expiry is lazy.
- **Retention jobs.** Rows of used guest links and resend attempts are not purged.
- **Phase 6 optional extras.** Live seat updates by SSE (the seat map polls) and a per-buyer ticket limit were not built (O121).
- **Real-device checks.** The responsive layouts, the pinch zoom and the dark scheme were tested in jsdom only, not on a phone or in several browsers.
- **`ColorSchemeScript`.** Not added to `index.html`, so a stored dark preference can flash light on first paint (O117).
- **Other product scope.** Ticket check-in scanning, waitlist and waiting room, per-buyer limits per show, hold extension, general admission, price tiers, passwords, OAuth and MFA, an idle session timeout, mobile apps and multi-language UI.

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
| `.claude/rules/`, `.claude/skills/` | Rules and skills for Claude Code (generated from `.cursor/`) |
| `docs/release_guides/` | One release guide per phase |
| `CLAUDE.md` | Working rules for AI agents |
| `.env.example` | Non-secret defaults for every variable |
