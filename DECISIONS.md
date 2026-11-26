# SeatHolder decisions

The single record of design decisions and trade-offs for SeatHolder (the "SeatHold" ticketing brief). Every entry gives the context, the options considered, the choice, the trade-off accepted, and a status:

- `planned`: agreed, with the plan and iteration that will build it.
- `implemented`: built, with the files and tests that prove it.
- `open`: not decided yet.
- `superseded`: replaced; kept for history with the replacing entry.

Plans live in [`plans/`](plans/); the roadmap is [`plans/seatholder_product_roadmap.plan.md`](plans/seatholder_product_roadmap.plan.md).

## Contents

1. [Required decisions](#required-decisions) (brief section 4)
2. [Engineering KPIs](#engineering-kpis) (brief section 3)
3. [Security](#security)
4. [Scale: 100,000 visitors for 20,000 seats](#scale-100000-visitors-for-20000-seats)
5. [Other design decisions](#other-design-decisions)
6. [Back-office capability proposal](#back-office-capability-proposal)
7. [Scope and cuts](#scope-and-cuts)
8. [AI workflow](#ai-workflow)

---

## Required decisions

### D1. Locking and concurrency model for seat holds

- **Context.** A seat must never be sold twice, including under 100 parallel attempts on the same seat.
- **Options.**
  - Pessimistic `SELECT ... FOR UPDATE`, then write: correct, but two round trips and a read-then-write shape that is easy to get wrong.
  - Optimistic version column with retry: correct, but retries add latency and code under contention.
  - Distributed lock (Redis): an extra moving part; a lock in a second store can disagree with the database.
  - Database constraint only (`UNIQUE` on tickets): catches the double sale only at purchase, so two buyers both "hold" the same seat.
  - **Atomic conditional `UPDATE` per seat plus a unique constraint as backstop.**
- **Choice.** `UPDATE seats SET status='held', hold_id=$hold, held_until=$expires WHERE id=$seat AND event_id=$event AND (status='available' OR (status='held' AND held_until <= $now)) RETURNING id`. `$now` is the value read once from the `Clock` for the operation (O4). Zero rows means the seat is taken (409). The holder's hold row is created with `INSERT ... ON CONFLICT DO NOTHING` on a partial unique index, so parallel first clicks of one holder share one hold. Confirm uses the same pattern (`WHERE hold_id=$hold AND held_until > $now`). `UNIQUE(seat_id)` on `tickets` is the backstop. No application-side check-then-write anywhere.
- **Trade-off.** All contention lands on PostgreSQL row locks; a very hot seat serializes on one row (fine at this scale, see Scale). One statement per clicked seat instead of a batch.
- **Status.** `planned`: Phase 2 it-3 (hold), it-5 (confirm). Proof: 100 parallel holds on one seat -> exactly 1 winner. Backstop proof: a forced second ticket for a sold seat is rejected by `UNIQUE(seat_id)` and the confirm rolls back (Phase 2 it-5).

### D2. Where hold state lives and how expiry fires

- **Context.** A hold lasts X minutes (default 10); after that the seats return to sale, deterministically.
- **Options.** TTL store (Redis keys with expiry); scheduled sweeper; lazy expiry on read; queue with delayed messages.
- **Choice.** Hold state lives on the seat row (`hold_id`, `held_until`) and in a `holds` row (`expires_at`). **Lazy expiry**: every read and write treats `held_until <= now` as available, so correctness never depends on a background job. An idempotent sweeper query exists for tidiness only (production would run it once from EventBridge Scheduler). `now` is read once per operation from an injected `Clock` (database time in the running app, a controlled clock in tests) and passed to every statement, the sweeper included; no SQL statement calls `now()` itself.
- **Trade-off.** Expired rows stay `held` in storage until touched or swept, so every query and admin count must apply the same rule. No push notification when a hold expires; the UI relies on its countdown and polling.
- **Status.** `planned`: Phase 2 it-4. Proof: controlled-clock test, seat back on sale after X minutes, same result every run, no real waiting.

### D3. Caching

- **Context.** Search and seat maps are read-heavy; holds and payments must always be exact.
- **Options.** No cache; in-process memory cache (breaks with several instances); CDN edge cache; Redis or ElastiCache.
- **Choice (written; building it is optional).**
  - Cached: show search results per normalized query for 30 s, facets for 5 min, event detail for 60 s; public seat availability per event for 1-2 s at CloudFront. Keys include every filter and the page.
  - Invalidated on: admin event creation or price change (event detail, search, facets).
  - Seat API split to match: `GET /api/events/:eventId/seats` is public and identical for every viewer, so it can be cached; the viewer's own hold comes from `GET /api/events/:eventId/hold` (never cached) and is merged in the browser.
  - **Never cached:** holds, the viewer's own `held_by_me` state, checkout, payments, sessions, `/api/auth/me`, My bookings, guest pages, anything under `/api/admin`.
- **Trade-off.** A seat map can be up to 2 s stale; a click on a seat that was just taken returns 409 and the map refreshes. No in-process cache, to keep instances stateless.
- **Status.** `planned` as written entry: Phase 5 it-3. Implementation not planned.

### D4. Late payment

- **Context.** Payment succeeds 3 seconds after the hold expired, and the seat is already held by another buyer.
- **Options.** Honour the payment and take the seat back (sells a seat the other buyer holds); move the buyer to other seats automatically; reject and refund.
- **Choice.** The mock payment is authorized outside the database transaction, then the confirm transaction requires every seat of the hold to still be `held` by it with `held_until > now`. If not, the transaction rolls back, the booking is `rejected`, the payment is `voided`, and the buyer gets 409 `HOLD_EXPIRED` with the map refreshed to choose again.
- **Trade-off.** A buyer who paid a little late loses the seats and must start again; no automatic substitute seats. A real provider would need a refund or void call, made idempotent with the payment's idempotency key.
- **Status.** `planned`: Phase 2 it-5. Proof: test with the clock moved past expiry and the seat retaken.

### D5. Guest one-time link

- **Context.** Guests buy with an email only and receive a link that shows the ticket and its QR.
- **Options.** Single view (dies after first view); **single exchange into a session**; reusable until expiry.
- **Choice.** The email link carries a random 32-byte token in the URL fragment (kept out of server logs and Referer). Opening it posts the token once to `/api/guest/exchange`, which consumes it and sets a guest session cookie scoped to that one booking, valid until the event start plus 1 day. The link can be exchanged within 168 h. A lost link is replaced via "send me a new link" with the email: always answers 204, sends new links for upcoming guest bookings, invalidates older unused links, and revokes existing guest sessions for those bookings. Only token hashes are stored.
- **Trade-off.** More moving parts than a plain link (exchange, guest session, resend). A guest who clears cookies needs a new link. Forwarding a used link does not share the ticket. Requesting a new link logs out a guest session on another device.
- **Status.** `planned`: Phase 3 it-3, it-8. Decided 2026-11-26.

### D6. Data store and consistency guarantees

- **Context.** One source of truth for seats, holds, bookings, users and sessions.
- **Options.** PostgreSQL only; PostgreSQL plus Redis for holds or sessions; a document store.
- **Choice.** PostgreSQL 17 only (Prisma behind repositories). Guarantees relied on: row-level locks taken by `UPDATE` (concurrent updates of one row serialize, and the second re-evaluates the `WHERE` under READ COMMITTED); atomic transactions for confirm; `UNIQUE`, `CHECK` and foreign-key constraints for invariants (one ticket per seat, a held seat always has a hold, one active hold per holder and event); the database clock, read once per operation through the `Clock` port (O4), as the single time source for expiry in production.
- **Trade-off.** One writer database is the scaling limit for the hold path; session lookups and polling also land on it until a cache is approved (see Scale).
- **Status.** `planned`: Phase 0 it-3, Phase 1 it-2, Phase 2 it-1.

---

## Engineering KPIs

| KPI | Target | How it is shown | Status |
|---|---|---|---|
| Oversell | 0 seats sold twice | Test: 100 parallel holds on one seat produce exactly 1 winner | `planned` Phase 2 it-3 |
| Hold expiry | Seat back on sale after X minutes, same result every run | Test with a controlled clock, no real waiting | `planned` Phase 2 it-4 |
| Time to first run | Clean Mac to running system < 10 min | `install-seathold` skill, timed run | `planned` Phase 0 it-7, Phase 5 it-1 |
| Caching | See D3 | Written | `planned` Phase 5 it-3 |
| Latency | Search `GET /api/shows` p95 < 150 ms server time; seat hold p95 < 50 ms; checkout p95 < 200 ms excluding the payment provider | Written; optional short measurement | `planned` Phase 5 it-3 |
| Latency threats | The hold transaction itself (clock read, expire a stale hold, insert or reuse the hold, update the seat: about four round trips inside the 50 ms budget), hot seat rows at on-sale, seat-map polling on the writer, connection-pool exhaustion behind RDS Proxy, full-text query plans at larger catalog size | Written | `planned` Phase 5 it-3 |
| Scale | See Scale section | Written | `planned` Phase 5 it-3 |
| Security | See Security section | Code + written | `planned` Phase 1 it-8 |
| Own KPI | Hold-to-purchase conversion and hold expiry rate per event: shows whether the 10-minute window and checkout work, and detects seat hoarding. Alternatives considered: p99 click-to-held time; QR fetch success rate | Written | `planned` default; confirm in Phase 5 it-0 |

---

## Security

### Implemented controls (planned)

| Control | Decision | Status |
|---|---|---|
| Login | Passwordless 6-digit email codes (`crypto.randomInt`), HMAC-SHA256 with a pepper, 10 min, 5 attempts, single use; a new request invalidates older codes | `planned` Phase 1 it-3 |
| Code request limit | Database-backed: 5 per 15 min per email, 60 s cooldown (holds across instances). Answers 204 for any well-formed email; over the limit 429 with retry time for any email string, so neither response reveals whether an account exists | `planned` Phase 1 it-3 |
| Sessions | Random 32-byte token in `HttpOnly`, `SameSite=Lax`, `Secure` (production) cookie on `/api`; only the SHA-256 stored; rotated on login; fixed 30-day lifetime, no idle timeout (O19); logout and logout-all revoke immediately | `planned` Phase 1 it-4 |
| CSRF | `@fastify/csrf-protection` double-submit token in `X-CSRF-Token`, plus Origin check, on every state-changing browser request; 403 otherwise | `planned` Phase 1 it-5 |
| Back-office authorization | Server-side: one `/api/admin/*` plugin with a prefix hook (`requireAuth` then `requireRole('admin')`), role read from the database per request; 401 anonymous, 403 buyer. One test enumerates every admin route | `planned` Phase 1 it-6 |
| Admin grant | Only seed or CLI (`npm run user:promote`); sign-up always creates `buyer`; no HTTP route changes roles | `planned` Phase 1 it-6 |
| Guest link | Unguessable 32-byte token, hashed, single exchange, expiring; resend revokes existing guest sessions (D5) | `planned` Phase 3 it-3 |
| Log redaction | Pino redacts `Cookie`, `Set-Cookie` and `X-CSRF-Token`; request bodies (codes, tokens) are never logged | `planned` Phase 0 it-4 |
| CORS | Closed: no CORS plugin, one origin for frontend and API (O5) | `planned` Phase 0 it-4 |
| QR payload | Random 128-bit ticket code (base64url), unique, not derived from ids, so it cannot be guessed or enumerated | `planned` Phase 2 it-5, Phase 3 it-8 |
| Anonymous holders | Random visitor token cookie, hashed in the database; a holder can only touch their own hold (404 otherwise) | `planned` Phase 2 it-6 |
| Secrets | None in the repository, images, CI logs or `VITE_*`; production reads them from AWS Secrets Manager or SSM Parameter Store | `planned` Phase 0 it-1, it-3 |
| Input validation | zod schemas at every HTTP boundary with explicit bounds (grid size, price, page size, date ranges) | `planned` every phase |

### Before production (written, not built)

- AWS WAF rate rules at the edge (in-process limits do not hold across instances).
- Idle timeout for admin sessions; a fresh code before destructive admin actions.
- Audit log of admin actions.
- Purge jobs for old login codes, expired holds and guest links (bounded batches).
- Real payment provider: webhook signature checks, idempotency keys, refunds.
- Dependency and container image scanning in CI.

---

## Scale: 100,000 visitors for 20,000 seats

- **What breaks first.** The seat-hold write path: thousands of conditional updates per second on the same event's rows, competing for connections and row locks on the one writer. The schema allows such an event: up to 20,000 seats per event (O17). Next, seat-map polling (100,000 clients every few seconds) and the per-request session lookup, both on the writer.
- **What would change.**
  - A virtual waiting room in front of the on-sale (CloudFront + a queue token) so only as many buyers as the hold path can serve enter at once.
  - Seat availability served from the CDN with a 1-2 s TTL (D3); the per-user hold state stays uncached and small.
  - Search and facets from a read replica.
  - RDS Proxy for connection pooling; short transactions only.
  - Sessions in ElastiCache (needs approval; today PostgreSQL).
  - Per-buyer hold limits to stop hoarding.
- **AWS services.** CloudFront, WAF, S3 (frontend), ALB, ECS Fargate with auto scaling (backend), Aurora PostgreSQL with a read replica and RDS Proxy, SES (email), Secrets Manager, CloudWatch, EventBridge Scheduler (sweeper).
- **Status.** `planned` as written entry: Phase 5 it-3. Design invariants that keep this path open are already agreed (see O3).

---

## Other design decisions

### O1. Stack and architecture

- **Choice.** Backend: Node 24, TypeScript, Fastify, Prisma, PostgreSQL. Frontend: React, TypeScript, Vite. Tests: Vitest. npm workspaces. A modular monolith with explicit modules (`auth`, `catalog`, `booking`, `guest-access`, `backoffice`).
- **Options.** Microservices; NestJS; Next.js full stack.
- **Trade-off.** One deployable is simpler and fits 4-6 hours; module boundaries keep later extraction possible.
- **Status.** `planned`: Phase 0 to Phase 4. In place after Phase 0: npm workspaces, Fastify, Prisma, React, Vite and Vitest (`package.json`, `backend/package.json`, `frontend/package.json`; run by `npm run verify-fast-part`). Missing: the `auth`, `catalog`, `booking`, `guest-access` and `backoffice` modules, which arrive from Phase 1, so no test proves the module layout yet.

### O2. Authentication model

- **Choice.** Passwordless email codes for everyone, server-side sessions in PostgreSQL, one login flow; admins are normal users with `role='admin'`.
- **Options.** Passwords (hashing, reset flows); OAuth (external setup on a clean Mac); JWT in browser storage (no immediate revocation, XSS exposure); a separate admin login page (reveals which emails are admins).
- **Trade-off.** Demo logins need the local mail catcher (Mailpit) to read the code; the install skill prints its URL.
- **Status.** `planned`: Phase 1.

### O3. Production target and invariants (AWS, not deployed)

- **Choice.** Designed for AWS: S3 + CloudFront (frontend, `/api/*` routed to the ALB), ECS Fargate behind an ALB (backend), RDS or Aurora PostgreSQL 17 with RDS Proxy, SES, Secrets Manager or SSM, CloudWatch, WAF. Invariants enforced by the rules: no request, session, hold, cache or rate-limit state in process memory; the API always under `/api` on the frontend origin; database time for expiry; startup work and scheduled jobs idempotent or run once; configuration only from environment.
- **Options.** No named target, hosting-agnostic only (the scale answer would stay vague); a single virtual machine with Docker Compose (simplest, but no horizontal scaling or managed database story); serverless functions behind API Gateway (cold starts and many short-lived PostgreSQL connections on the hot hold path).
- **Trade-off.** Some local conveniences are off the table (in-memory caches, per-process counters). Deployment itself is out of scope.
- **Status.** `planned`: Phase 0 it-3, it-4, it-6. In place: configuration only from environment (`backend/src/config/load-config.ts`, test `load-config.test.ts`), database time (O4), everything under `/api` (O5), the stateless backend image (O28, `scripts/dockerfile-hygiene.test.mjs`). Missing: the arm64 image build is checked only by the CI `image-build` job and is not proven on the development host; the no-in-memory-state invariant has no test until Phase 1 and later add state; the AWS target itself is documentation only.

### O4. Clock source

- **Choice.** A `Clock` port: production reads `clock_timestamp()` from PostgreSQL once per operation and passes the value to every statement of that operation; tests use a controlled clock. No SQL statement calls `now()` itself.
- **Options.** Host clock (`Date.now()`) everywhere.
- **Trade-off.** One extra cheap query per operation; in return several instances with skewed host clocks agree on expiry, and tests stay deterministic.
- **Status.** `implemented`: `backend/src/shared/time/` (`Clock`, `DatabaseClock`, `ControlledClock`), tests `controlled-clock.test.ts` and `database-clock.integration.test.ts` (Phase 0 it-4). `DatabaseClock` is built in `server.ts` and passed to `buildApp` in its deps; no route reads it yet.

### O5. One origin for frontend and API

- **Choice.** All routes under `/api`; Vite proxy locally, CloudFront path routing in production. No CORS plugin is installed, so cross-origin browser calls are refused. The health check is `GET /api/health` as well (container check, ALB target group, install skill), so the proxy and CloudFront route one path prefix; there is no separate `/health`.
- **Options.** Separate API domain with credentialed CORS.
- **Trade-off.** Needs path routing at the edge; in return session cookies stay first-party with `SameSite=Lax` and CORS stays closed.
- **Status.** `implemented`: `backend/src/app.ts` registers every route under `/api` and no CORS plugin; tests `app.test.ts` (`/health` is 404, no CORS headers) (Phase 0 it-4). `frontend/vite.config.ts` proxies `/api` to `http://127.0.0.1:${BACKEND_PORT}` (default 3001) with the dev server on 5173; test `frontend/vite.config.test.ts` (Phase 0 it-5).

### O6. Hold model on the seat map

- **Choice.** Hold on click: each click holds that seat at once and adds it to the holder's single active hold for the event; all seats share the expiry set when the hold was created. Holder is a signed-in user or an anonymous visitor cookie.
- **Options.** Select locally, then hold all at once (conflicts appear late, map stale while choosing); a timer per seat (several countdowns, partial expiry at checkout).
- **Trade-off.** One write per click; adding a seat late does not extend the timer.
- **Status.** `planned`: Phase 2 it-3. Decided 2026-11-26.

### O7. Seat cap per hold

- **Choice.** `MAX_SEATS_PER_HOLD`, default 10, enforced in the hold service.
- **Options.** No limit; a per-buyer-per-show limit now.
- **Trade-off.** A buyer can still open holds on several events; per-buyer-per-show limits are left as a later change.
- **Status.** `planned`: Phase 2 it-3. Decided 2026-11-26.

### O8. Mock payment

- **Choice.** A `PaymentGateway` port with a mock adapter whose outcome the buyer picks (succeed or fail); authorization outside the database transaction; idempotency key per attempt.
- **Options.** A provider sandbox such as Stripe test mode (needs an external account and network on a clean Mac); a random success or failure (cannot be demoed on demand); always succeed (cannot show the failure and late-payment paths).
- **Trade-off.** No card data and no real provider; the port is where a real provider plugs in.
- **Status.** `planned`: Phase 2 it-5.

### O9. Seed data

- **Choice.** Deterministic seed: about 12 venues across about 5 countries and 8 cities, 200 shows across types and genres, one event per show over the next 90 days, each with a generated 10 x 20 grid (200 seats). Seeded users `admin@seathold.local` and `buyer@seathold.local`.
- **Options.** One venue as in the brief's minimum (venue, city and country filters would have one value).
- **Trade-off.** 40,000 seat rows on top of the brief's minimum, seeded with batched inserts; the clean-Mac install time is measured in Phase 5. If the seed threatens the 10-minute target, it drops to fewer events with full grids, keeping the venue spread.
- **Status.** `planned`: Phase 1 it-6 (users), Phase 2 it-1 (catalog). Decided 2026-11-26.

### O10. Search

- **Choice.** One result row per event. Text matches the show title through a stored generated `tsvector` column on `shows` (`simple` config, GIN) or the venue name through `ILIKE` on the small venues table, with indexed filters on type, genre, country, city, venue and `starts_at`; pagination capped at 50; seats left is one grouped count per result page over the index `seats(event_id, status)`, with no stored counter.
- **Options.** `ILIKE` scans; an external search engine (OpenSearch).
- **Trade-off.** No fuzzy or typo-tolerant matching; no extra service to run.
- **Status.** `planned`: Phase 3 it-1.

### O11. Live seat status

- **Choice.** Polling every 3 s on the event page (TanStack Query).
- **Options.** Server-Sent Events; WebSocket.
- **Trade-off.** Up to 3 s staleness and more requests; no long-lived connections to manage behind the ALB. Combined with the 1-2 s edge cache at scale (D3).
- **Status.** `planned`: Phase 3 it-6.

### O12. Design system base

- **Choice.** Mantine, themed, with our own component layer; `DateTimeRangePicker` (date and time from-to in one control) and `SeatMap` (SVG) are our own extensions.
- **Options.** MUI (its date-time range picker is in the paid tier); Radix with own styling (more work).
- **Trade-off.** A dependency on Mantine's API; Mantine has a date range and a single date-time picker but no date-time range, so the extension is real work.
- **Status.** `planned`: Phase 3 it-4, it-6; Phase 6.

### O13. Local environment

- **Choice.** Development, tests and verify run on Docker Compose (PostgreSQL 17, Mailpit). The macOS install skill uses Homebrew services with the same versions and `.env` keys.
- **Options.** Docker on the Mac too; Homebrew everywhere.
- **Trade-off.** Two local setups to keep in line (a review check enforces it); in return the clean-Mac run avoids Docker Desktop's GUI install and fits under 10 minutes.
- **Status.** `planned`: Phase 0 it-3, it-7. In place: `docker-compose.yml` (PostgreSQL 17.12, Mailpit v1.34.0; checked by `docker compose config -q`), `.env.example` (test `backend/src/config/env-example.test.ts`), `README.md` (test `scripts/readme-commands.test.mjs`), `.claude/skills/install-seathold/SKILL.md` (tracked, test `scripts/git-hygiene.test.mjs`). Missing: the install skill is v0 and has not been run on a Mac, so the Homebrew path is unproven.

### O14. CI

- **Choice.** GitHub Actions: lint, typecheck, unit and integration tests with a PostgreSQL 17 service, build, and a multi-architecture backend image build (not pushed). `scripts/verify.mjs` runs the same steps locally.
- **Options.** GitLab CI (the repository is on GitHub, so it would need a mirror); no CI, local `verify` only (no visible evidence in the public repository).
- **Trade-off.** Image is built but never deployed.
- **Status.** `planned`: Phase 0 it-2, it-6. The workflow and its `image-build` job (QEMU and Buildx, no push) exist, and `scripts/verify.test.mjs` asserts that `scripts/verify.mjs` runs the commands of `.github/workflows/ci.yml`. Missing: the workflow has not run on GitHub yet, so the PostgreSQL service and the multi-architecture build are unproven; the entry moves to `implemented` after the first green run.

### O15. Committed AI setup

- **Choice.** `CLAUDE.md` (standalone) and the install skill are committed; the full rule and skill set stays local.
- **Options.** Commit the full rule and skill set (complete picture, but large and partly generic); commit only the install skill (the brief also requires `CLAUDE.md`).
- **Trade-off.** Reviewers see the working rules in summary in `CLAUDE.md`, not the full rule files.
- **Status.** `implemented` (Phase 0 it-1, it-7): `CLAUDE.md` is standalone and tracked, the install skill is tracked and not ignored, and the rule and skill set stays ignored; tests `scripts/git-hygiene.test.mjs` and `scripts/sync-ai-rules.test.mjs` (the generated-skill sync leaves `install-seathold` alone). The skill content is v0 and unproven on a Mac (see O13).

### O16. Money

- **Choice.** Integer minor units (`price_minor`), one currency per event (default `EUR`); a booking copies the unit price and total at purchase.
- **Options.** Decimal or float amounts; multi-currency pricing.
- **Trade-off.** No multi-currency (out of scope in the brief); later price changes never alter past bookings.
- **Status.** `planned`: Phase 2 it-1, it-5.

### O17. Event size cap

- **Choice.** 1-200 rows and 1-200 seats per row, at most 20,000 seats per event, enforced by a `CHECK` and by input validation.
- **Options.** 50 x 50 (2,500 seats, too small for the scale scenario); no cap.
- **Trade-off.** A 20,000-seat event means a 20,000-row insert in one transaction at creation and a heavy SVG seat map (zoom and pan in Phase 6).
- **Status.** `planned`: Phase 2 it-1, Phase 4 it-1.

### O18. Visitor hold on login

- **Choice.** With a session, the holder is the user. On the next booking request after login, each active visitor hold moves to the user, unless the user already has an active hold for that event; then the visitor hold's seats are released. Checkout resolves the holder session first, then visitor.
- **Options.** Keep holds on the visitor (the buyer loses them on login, or buys under the wrong identity); merge seats into the user's existing hold.
- **Trade-off.** In the rare conflicting case the visitor's seats go back on sale; merging was rejected because expiry and seat cap would need extra rules.
- **Status.** `planned`: Phase 2 it-6.

### O19. Session lifetime

- **Choice.** Fixed 30-day sessions, no idle timeout.
- **Options.** Short sessions with refresh; a sliding idle timeout.
- **Trade-off.** A stolen cookie stays valid longer; mitigated by `HttpOnly` cookies, logout-all, and an admin idle timeout listed before production.
- **Status.** `planned`: Phase 1 it-4.

### O20. Phase 0 tooling versions

- **Choice.** Exact pins, Node 24. TypeScript 6.0.3 (typescript-eslint 8.74.0 supports TypeScript below 6.1, so TypeScript 7 waits). Prisma 7.10.1 (the `latest` tag is a release candidate); with Prisma 7 the connection URL lives in `backend/prisma.config.ts`, not in `schema.prisma`. `@types/node` 24.x to match the runtime. Extra packages beyond the Phase 0 list: `pg` and `@types/pg` (`scripts/test-db.mjs` and the integration smoke test), `@eslint/js` (ESLint recommended rules), `@testing-library/dom` (peer of Testing Library React), `@types/react` and `@types/react-dom`. Root `overrides` pins the transitive `effect` to 3.22.5 because Prisma's config package pulls a version with a high-severity advisory (dev-only).
- **Options.** TypeScript 7 (not supported by typescript-eslint yet); Prisma 8 release candidate; a dated exception in `scripts/security-scan.mjs` instead of the override.
- **Trade-off.** The override must be removed once Prisma ships a fixed `effect`.
- **Status.** `implemented`: `package.json`, `backend/package.json`, `frontend/package.json`, `package-lock.json` (Phase 0 it-2).

### O21. Path-scope check with an explicit allowlist

- **Choice.** `node scripts/sync-ai-rules.mjs --check` (part of `npm run lint`) fails on a rule path scope that matches no tracked file, except the globs listed in `unmatchedGlobAllowlist` in `scripts/sync-ai-rules.mjs`. Each entry is one glob with a note naming the phase or iteration that adds its files (auth and email globs: Phase 1; config, `.env.example`: it-3; backend skeleton: it-4; frontend client: it-5; `Dockerfile*`: it-6; `docs/**`: it-7; `context/**` and `**/tests/**`: never in this repository). An allowlisted glob that matches a tracked file fails, and so does an entry no rule uses, so the list only shrinks.
- **Options.** Warn only while the code does not exist (silently lets a mistyped glob pass for good); remove the globs from the rules until the code exists (rule files differ per phase); require every glob to match now (fails Phase 0, where there is no application code yet).
- **Trade-off.** Each phase deletes its entries from the list in the same change, a small chore; in return a typo in a glob cannot hide behind the warning.
- **Status.** `implemented`: `scripts/sync-ai-rules.mjs`, `scripts/sync-ai-rules.test.mjs` (Phase 0 it-2).

### O22. Production refuses a local-only frontend origin

- **Choice.** `loadConfig` (`backend/src/config/load-config.ts`) fails at startup when `APP_ENV=production` and `FRONTEND_ORIGIN` is not set explicitly, is not `https`, or is a loopback host (`localhost`, `127.0.0.1`, `[::1]`). In `local` the default is `http://localhost:5173`. The error names the variable and its rule, never a value.
- **Options.** Also refuse the local-example `DATABASE_URL` credentials in production (CI runs with `APP_ENV=production` and that same test URL, so the rule would fail every CI job that loads config); refuse nothing (rule 01 asks that production refuses local-only values); more rules now (nothing else is local-only yet: the console email provider arrives in Phase 1 and adds its own rule).
- **Trade-off.** A weak production `DATABASE_URL` is not caught by config; it has no default and comes from the secret store. The Origin check from Phase 1 depends on `FRONTEND_ORIGIN`, so a wrong origin is the config mistake that matters most.
- **Status.** `implemented`: `backend/src/config/load-config.ts`, `backend/src/config/load-config.test.ts` (Phase 0 it-3).

### O23. Mailpit pinned to v1.34.0

- **Choice.** `docker-compose.yml` runs `axllent/mailpit:v1.34.0` (SMTP 1025 and UI 8025, both on 127.0.0.1, health check `/mailpit readyz`). The exact patch tag was the newest stable release on 2026-11-26; `latest`, `edge` and the moving `v1` and `v1.34` tags are not used.
- **Options.** `latest` (not reproducible, rule 12); a digest pin (unreadable, harder to update).
- **Trade-off.** The tag is bumped by hand.
- **Status.** `implemented`: `docker-compose.yml` (Phase 0 it-3).

### O24. Prisma driver adapter and no pino-pretty

- **Choice.** `@prisma/adapter-pg` 7.10.1 (exact pin, same version as Prisma) is a runtime dependency of the backend: Prisma 7 has no built-in query engine connection and needs a driver adapter; `PrismaService` builds `PrismaClient` with `PrismaPg({ connectionString })`. `pino-pretty` from the Phase 0 list is not installed: logs stay JSON everywhere, and nothing uses a pretty printer.
- **Options.** Prisma Accelerate (a hosted proxy, against the AWS target); installing `pino-pretty` for local logs (an unused dependency until someone pipes `npm run dev` through it).
- **Trade-off.** Local logs are JSON lines, harder to read than pretty output; `| npx pino-pretty` works ad hoc.
- **Status.** `implemented`: `backend/src/infrastructure/persistence/prisma-service.ts`, `backend/package.json` (Phase 0 it-4).

### O25. Log shape and redaction

- **Choice.** Fastify's logger writes JSON to stdout. Custom `req` and `res` serializers add the request and response headers to the log entries (Fastify's defaults omit them), and Pino `redact` replaces `req.headers.cookie`, `req.headers["x-csrf-token"]`, `req.headers.authorization` and `res.headers["set-cookie"]` with `[Redacted]` (`authorization` was added after review, because the serializer logs every request header). Request bodies are never logged. Shutdown logs `shutdown started` and `shutdown complete` (or `shutdown timed out`, exit 1) with the signal.
- **Options.** Do not log headers (nothing to redact, but less diagnostic detail); redact by allowlisting headers instead of a denylist.
- **Trade-off.** A denylist: a new secret-bearing header (for example a service API key header in Phase 1) must be added to `redactedPaths`. The logged `url` includes the query string, so a token must never travel in a query string.
- **Status.** `implemented`: `backend/src/infrastructure/logging/logger-options.ts`, `backend/src/shutdown.ts`, tests `presentation/http/log-redaction.test.ts`, `shutdown.test.ts` (Phase 0 it-4).

### O26. Frontend dependencies and the read-only ApiClient

- **Choice.** Exact pins in `frontend/package.json`: `react-router` 8.5.3, `@tanstack/react-query` 5.108.4, `@mantine/core` 9.8.2 and `@mantine/hooks` 9.8.2 (Mantine peer) are `dependencies`; `react` and `react-dom` stay `devDependencies` because the app ships as a static Vite bundle. `@mantine/dates` and `dayjs` from the Phase 0 list are not installed: no code imports them, so they wait for the first date UI (Phase 3 it-4). `ApiClient` (`frontend/src/shared/lib/api-client.ts`) sends relative `/api/...` URLs with `credentials: "include"`, maps a non-2xx response to `ApiError` (status, and `code` when the JSON body has a string `code`) and a failed request to `ApiNetworkError`; neither message contains response body text. It has `get` only. State-changing methods and the `X-CSRF-Token` header (rule 42) are added in Phase 1 together with the endpoint that issues the token, so no mutation can be sent without CSRF handling and no dead token code exists meanwhile.
- **Options.** Add `post`/`put`/`patch`/`delete` now without a token (a footgun against rule 42); invent a token endpoint in Phase 0; install `@mantine/dates` and `dayjs` early (unused dependencies, rule 12).
- **Trade-off.** Phase 1 extends `ApiClient` (a token provider and mutation methods); the shape of the token endpoint is decided there.
- **Status.** `implemented`: `frontend/package.json`, `frontend/src/shared/lib/api-client.ts`, test `api-client.test.ts` (Phase 0 it-5). The Phase 1 extension is `planned`.

### O27. Frontend shell: Mantine theme, router and test setup

- **Choice.** `App` takes the router as a prop: `main.tsx` passes `createBrowserRouter(routes)`, tests pass `createMemoryRouter(routes)`. Providers are Mantine (one `theme` object in `app/theme.ts`) and TanStack Query. The home placeholder uses `<header>`, `<main>` and one `<h1>`. Vitest runs under jsdom with `src/test/setup.ts` (stubs `matchMedia` and `ResizeObserver`, which Mantine needs). `vite.config.ts` exports `createViteConfig(env)` so the proxy is testable; `BACKEND_PORT` is read through Vite `loadEnv` and validated by name only.
- **Options.** A global router singleton (hard to test); `@testing-library/jest-dom` (one more dependency for assertions `getByRole` already makes).
- **Trade-off.** Setup stubs must be kept in step with what Mantine reads in jsdom.
- **Status.** `implemented`: `frontend/src/app/`, `frontend/src/features/home/`, `frontend/vite.config.ts`, tests `app.test.tsx`, `vite.config.test.ts` (Phase 0 it-5).

### O28. Backend image

- **Choice.** `backend/Dockerfile`, build context is the repository root (workspaces share the root lockfile). Three stages on `node:24.22.3-alpine3.24` pinned by tag and digest (the multi-arch index digest, so amd64 and arm64 both resolve from it): `base`, `build` (`npm ci -w backend`, `prisma generate`, `tsc` without source maps) and `runtime` (`npm ci --omit=dev --omit=optional -w backend --ignore-scripts`, compiled `dist` only). `--omit=optional` is needed because the lockfile keeps the Prisma CLI and TypeScript as optional peers of `@prisma/client`, and `--omit=dev` alone installs them (358 MB; with the flag 113 MB, 58 packages). `--ignore-scripts` because the generated client is built in the `build` stage. The image runs as `node`, files stay root-owned and read-only to it, `node backend/dist/server.js` is PID 1 (the server registers SIGTERM and SIGINT itself, so no init process), `HEALTHCHECK` uses busybox `wget` on `/api/health`, the port comes from the `BACKEND_PORT` build argument and environment variable (default 3001, the config default). No `.env`, secret or database URL is in the image. `@prisma/client` moved from `devDependencies` to `dependencies` of the backend (same pin 7.10.1): the generated client imports `@prisma/client/runtime/client`, so the first image without dev dependencies would not start.
- **Options.** `node:24-slim` (glibc, larger, no musl issue; the Fargate target does not need it); tini as init (extra package; node handles SIGTERM); `npm prune --omit=dev` from the build stage (copies the dev tree first); `curl` for the health check (an extra package).
- **Trade-off.** Residue in the runtime `node_modules` that npm keeps from the frontend workspace entries of the lockfile: `react`, `react-dom` (about 8 MB, never imported) and `@types/*`. Alpine is musl: a future native module must publish musl builds.
- **Status.** `implemented` for the build, run, health, SIGTERM, non-root and production-only checks (Phase 0 it-6): `backend/Dockerfile`, `.dockerignore`, `backend/package.json`, test `scripts/dockerfile-hygiene.test.mjs`. The arm64 build is not proven on the development host (no buildx or QEMU); it is checked by the `image-build` CI job.

### O29. No Prisma `binaryTargets`

- **Choice.** `schema.prisma` has no `binaryTargets`. Prisma 7's `prisma-client` generator with the `@prisma/adapter-pg` driver adapter compiles queries in WebAssembly inside `@prisma/client`; there is no native query engine file to select per platform, so `linux-musl-openssl-3.0.x` and `linux-musl-arm64-openssl-3.0.x` would be dead configuration. The Phase 0 plan listed them as a precaution.
- **Options.** Add the targets anyway (harmless, but misleading and unproven).
- **Trade-off.** If a later Prisma version or setup brings back a native engine, targets must be added then; the image smoke test (the server connects to PostgreSQL in the container) would fail first.
- **Status.** `implemented`: verified by running the Alpine image against PostgreSQL (Phase 0 it-6).

---

## Back-office capability proposal

**Manual release of a held seat.** An operator can free a seat stuck in a hold with a required reason (for example, a buyer abandoned checkout during a support call, or a hold blocks the last seat before showtime). It uses the same conditional update as a buyer release and writes a log row.

- **Status.** `planned` as a written proposal: Phase 4 it-7. Building it is optional (Phase 4 it-6).

---

## Scope and cuts

- **Priority order.** Auth foundation, booking core, end-to-end buyer and guest flow, back office, deliverables, design-system depth. If time runs out, cuts go from the last phase backwards.
- **Out of scope.** Real payments, real email delivery, cloud deployment, mobile apps, multi-language UI (brief section 7); general admission; multiple price tiers.
- **Time budget.** About 5.5 hours: Phase 0 0.75 h, Phase 1 0.75 h, Phase 2 1 h, Phase 3 1.25 h, Phase 4 0.5 h, Phase 5 0.75 h, Phase 6 0.5 h. Iterations are review units for AI-driven work, not hours each.
- **Cut candidates, in order.** Phase 6 beyond the base theme; manual seat release (Phase 4 it-6); guest link resend (Phase 3, keep exchange); search facets endpoint (hard-coded filter values instead); multi-architecture image build in CI (amd64 only).
- **Cut so far.** Nothing.

---

## AI workflow

### How Claude is set up

- Claude Code is the main development tool, with project rules (test first, approval before code changes, module boundaries, security, AWS production invariants), skills (feature planning, verification, reviews) and read-only review agents.
- Every phase has a plan in `plans/` with test-first iterations; each iteration is one reviewable change with its own approval.
- Subagents run implementation steps; their reports are checked against the code and the test output before anything is accepted.

### Where Claude was wrong, and how it was caught

1. **Hold expiry on the host clock (design).** Claude's first plan compared `held_until` with the application's clock. Asking Claude to review the roadmap from an AWS production point of view exposed the flaw: with several backend instances, a host clock running ahead could treat a valid hold as expired and give the seat to someone else. The design changed to database time in production with a controlled clock in tests (O4), and a review check now flags host time where instances must agree.

2. **Plans that disagreed with each other (planning).** A separate review of the plans in another AI tool found that the roadmap, the Phase 2 plan and this file stated the lock predicate differently (`<` against `<=` at the expiry instant), named three different clock sources, described a personalized seat response as edge-cacheable, and capped events at 2,500 seats while the scale answer assumed 20,000. Each was reconciled to one wording (D1, D2, D3, O4, O17), and the missing cases it raised (login with a visitor hold, parallel first clicks of one holder, a test that fires the ticket backstop) became decisions and tests.

More examples are collected in `docs/ai-workflow-log.md` as work happens (`planned`: Phase 0 it-7 onward).
