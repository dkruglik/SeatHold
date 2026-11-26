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
| Log redaction | Pino redacts `Cookie`, `Set-Cookie`, `X-CSRF-Token` and `Authorization`; request bodies (codes, tokens) are never logged | `implemented` Phase 0 it-4: `backend/src/infrastructure/logging/logger-options.ts`, test `backend/src/presentation/http/log-redaction.test.ts` |
| CORS | Closed: no CORS plugin, one origin for frontend and API (O5) | `implemented` Phase 0 it-4: `backend/src/app.ts`, test `backend/src/app.test.ts` |
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
- **Status.** `implemented` (Phase 0 it-1, it-7): `CLAUDE.md` is standalone and tracked, the install skill is tracked and not ignored, and the rule and skill set stays ignored; tests `scripts/git-hygiene.test.mjs` and `scripts/sync-ai-rules.test.mjs` (the generated-skill sync leaves `install-seathold` alone). The skill content is v0 and unproven on a Mac (see O13). The AI-rule sync check only runs where `.cursor/` exists (local checkouts); a clean CI checkout skips it because `.cursor/` is gitignored. It is a local guard by design.

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
- **Status.** `implemented`: `scripts/sync-ai-rules.mjs`, `scripts/sync-ai-rules.test.mjs` (Phase 0 it-2). The check only runs where `.cursor/` exists (local checkouts); on a clean CI checkout `.cursor/` is gitignored and the check is skipped, so it is a local guard by design.

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

- **Choice.** Fastify's logger writes JSON to stdout. Custom `req` and `res` serializers add the request and response headers to the log entries (Fastify's defaults omit them), and Pino `redact` replaces `req.headers.cookie`, `req.headers["x-csrf-token"]`, `req.headers.authorization` and `res.headers["set-cookie"]` with `[Redacted]` (`authorization` was added after review, because the serializer logs every request header). Request bodies are never logged. Shutdown signals are bound with `on` (`bindShutdownSignals`), not `once`, so a second signal reaches the shutdown guard instead of killing the process. Shutdown logs `shutdown started` and `shutdown complete` (or `shutdown timed out`, exit 1) with the signal.
- **Options.** Do not log headers (nothing to redact, but less diagnostic detail); redact by allowlisting headers instead of a denylist.
- **Trade-off.** A denylist: a new secret-bearing header (for example a service API key header in Phase 1) must be added to `redactedPaths`. The logged `url` is the path only (the query string is cut off, review fix), so a token in a query string cannot be logged; the diagnostic lost is the query parameters of a failing request (the route and method remain). The error path is covered too: a throwing route logs one error record whose request headers stay `[Redacted]`.
- **Status.** `implemented`: `backend/src/infrastructure/logging/logger-options.ts`, `backend/src/shutdown.ts`, tests `presentation/http/log-redaction.test.ts`, `shutdown.test.ts` (Phase 0 it-4, query string and error path in the review fixes).

### O26. Frontend dependencies and the read-only ApiClient

- **Choice.** Exact pins in `frontend/package.json`: `react-router` 8.5.3, `@tanstack/react-query` 5.108.4, `@mantine/core` 9.8.2 and `@mantine/hooks` 9.8.2 (Mantine peer) are `dependencies`; `react` and `react-dom` stay `devDependencies` because the app ships as a static Vite bundle. `@mantine/dates` and `dayjs` from the Phase 0 list are not installed: no code imports them, so they wait for the first date UI (Phase 3 it-4). `VITE_API_BASE_URL` must be a same-origin path starting with a single `/` (an absolute http(s) or protocol-relative URL is rejected by `loadFrontendConfig`, so the app cannot be pointed at another origin and CORS stays closed); CI and `scripts/verify.mjs` set it to `/api`. The entry point `main.tsx` calls `bootstrap` (`frontend/src/app/bootstrap.tsx`), which loads that config from `import.meta.env` (an invalid value throws at startup, naming the variable), builds the one `ApiClient` and provides it through `ApiClientProvider` and `useApiClient()` (`api-client-context.tsx`); Vite reads `VITE_*` from the repository-root `.env` (`envDir`). `ApiClient` (`frontend/src/shared/lib/api-client.ts`) rejects a request path starting with `//` and sends relative `/api/...` URLs with `credentials: "include"`, maps a non-2xx response to `ApiError` (status, and `code` when the JSON body has a string `code`) and a failed request to `ApiNetworkError`; neither message contains response body text. It has `get` only. State-changing methods and the `X-CSRF-Token` header (rule 42) are added in Phase 1 together with the endpoint that issues the token, so no mutation can be sent without CSRF handling and no dead token code exists meanwhile.
- **Options.** Add `post`/`put`/`patch`/`delete` now without a token (a footgun against rule 42); invent a token endpoint in Phase 0; install `@mantine/dates` and `dayjs` early (unused dependencies, rule 12).
- **Trade-off.** Phase 1 extends `ApiClient` (a token provider and mutation methods); the shape of the token endpoint is decided there.
- **Status.** `implemented`: `frontend/package.json`, `frontend/src/shared/lib/api-client.ts`, tests `api-client.test.ts`, `bootstrap.test.tsx`, `load-frontend-config.test.ts`, `vite.config.test.ts` (Phase 0 it-5, review fixes). The Phase 1 extension is `planned`.

### O27. Frontend shell: Mantine theme, router and test setup

- **Choice.** `App` takes the router as a prop: `main.tsx` passes `createBrowserRouter(routes)`, tests pass `createMemoryRouter(routes)`. Providers are Mantine (one `theme` object in `app/theme.ts`) and TanStack Query. The home placeholder uses `<header>`, `<main>` and one `<h1>`. Vitest runs under jsdom with `src/test/setup.ts` (stubs `matchMedia` and `ResizeObserver`, which Mantine needs). `vite.config.ts` exports `createViteConfig(env)` so the proxy is testable; `BACKEND_PORT` is read through Vite `loadEnv` from the repository-root `.env` (resolved from the config file's directory, not the working directory, because the backend reads that same file) and validated by name only.
- **Options.** A global router singleton (hard to test); `@testing-library/jest-dom` (one more dependency for assertions `getByRole` already makes).
- **Trade-off.** Setup stubs must be kept in step with what Mantine reads in jsdom.
- **Status.** `implemented`: `frontend/src/app/`, `frontend/src/features/home/`, `frontend/vite.config.ts`, tests `app.test.tsx`, `vite.config.test.ts` (Phase 0 it-5).

### O28. Backend image

- **Choice.** `backend/Dockerfile`, build context is the repository root (workspaces share the root lockfile). Three stages on `node:24.22.3-alpine3.24` pinned by tag and digest (the multi-arch index digest, so amd64 and arm64 both resolve from it): `base`, `build` (`npm ci -w backend`, `prisma generate`, `tsc` without source maps) and `runtime` (`npm ci --omit=dev --omit=optional -w backend --ignore-scripts`, compiled `dist` only). `--omit=optional` is needed because the lockfile keeps the Prisma CLI and TypeScript as optional peers of `@prisma/client`, and `--omit=dev` alone installs them (358 MB; with the flag 113 MB, 58 packages). `--ignore-scripts` because the generated client is built in the `build` stage. The image runs as `node`, files stay root-owned and read-only to it, `node backend/dist/server.js` is PID 1 (the server registers SIGTERM and SIGINT itself, so no init process), `HEALTHCHECK` uses busybox `wget` on `/api/health`, the image sets `BACKEND_HOST=0.0.0.0` (the container must listen on all interfaces; `.env.example` binds `127.0.0.1` so host development does not listen on the LAN, and the `HEALTHCHECK` uses `127.0.0.1` inside the container), the port comes from the `BACKEND_PORT` build argument and environment variable (default 3001, the config default). No `.env`, secret or database URL is in the image. `@prisma/client` moved from `devDependencies` to `dependencies` of the backend (same pin 7.10.1): the generated client imports `@prisma/client/runtime/client`, so the first image without dev dependencies would not start.
- **Options.** `node:24-slim` (glibc, larger, no musl issue; the Fargate target does not need it); tini as init (extra package; node handles SIGTERM); `npm prune --omit=dev` from the build stage (copies the dev tree first); `curl` for the health check (an extra package).
- **Trade-off.** Residue in the runtime `node_modules` that npm keeps from the frontend workspace entries of the lockfile: `react`, `react-dom` (about 8 MB, never imported) and `@types/*`. Alpine is musl: a future native module must publish musl builds.
- **Status.** `implemented` for the build, run, health, SIGTERM, non-root and production-only checks (Phase 0 it-6): `backend/Dockerfile`, `.dockerignore`, `backend/package.json`, test `scripts/dockerfile-hygiene.test.mjs`. The arm64 build is not proven on the development host (no buildx or QEMU); it is checked by the `image-build` CI job.

### O29. No Prisma `binaryTargets`

- **Choice.** `schema.prisma` has no `binaryTargets`. Prisma 7's `prisma-client` generator with the `@prisma/adapter-pg` driver adapter compiles queries in WebAssembly inside `@prisma/client`; there is no native query engine file to select per platform, so `linux-musl-openssl-3.0.x` and `linux-musl-arm64-openssl-3.0.x` would be dead configuration. The Phase 0 plan listed them as a precaution.
- **Options.** Add the targets anyway (harmless, but misleading and unproven).
- **Trade-off.** If a later Prisma version or setup brings back a native engine, targets must be added then; the image smoke test (the server connects to PostgreSQL in the container) would fail first.
- **Status.** `implemented`: verified by running the Alpine image against PostgreSQL (Phase 0 it-6).

### O30. No `.env.local.example`

- **Choice.** The plan's it-3 listed `.env.local.example` next to `.env.example`. It was dropped: both workspaces read the single repository-root `.env` (the backend through `--env-file-if-exists=../.env`; the Vite dev server sets `envDir` to the repository root, so `BACKEND_*` for the proxy and `VITE_*` for the client both come from it), and nothing reads `.env.local`. `.env.example` is the template for host and Docker runs; `.env.docker.local.example` stays for the Compose overrides.
- **Options.** Keep a second template nothing loads (a trap: copying it does nothing).
- **Trade-off.** One file serves host and Docker runs, so the host values (`127.0.0.1`) are the example defaults and the image sets its own `BACKEND_HOST`.
- **Status.** `implemented`: `.env.local.example` deleted; `frontend/vite.config.ts` `envDir`, test `frontend/vite.config.test.ts` (Phase 0 review fixes).

### O31. Database pool size

- **Choice.** `DATABASE_POOL_MAX` (integer 1 to 100, default 10) in `loadConfig` is passed as `max` to the `pg` pool behind `PrismaPg`. Each instance opens at most that many connections, so instances times this value must stay under what RDS Proxy and PostgreSQL accept (rule 22, Connections). Invalid values fail at startup naming the variable, never the value. `DatabaseClock` raises `InfrastructureError` when the database returns no row.
- **Options.** The `pg` default (also 10, but implicit and not tunable per environment); no upper bound (a typo could exhaust the database).
- **Trade-off.** One more variable to size per environment; the bound of 100 is a sanity limit, not a capacity plan.
- **Status.** `implemented`: `backend/src/config/load-config.ts`, `backend/src/infrastructure/persistence/prisma-service.ts`, `.env.example`; tests `load-config.test.ts`, `prisma-service.test.ts`, `database-clock.test.ts` (Phase 0 review fixes).

### O32. APP_ENV defaults to local

- **Choice.** An unset `APP_ENV` gives `local` (plan section 7), which also skips the production `FRONTEND_ORIGIN` rule (O22). `load-config.test.ts` documents this fail-open default.
- **Options.** No default, so a missing `APP_ENV` fails at startup (safer, but every local run and test needs the variable); default `production` (wrong for development).
- **Trade-off.** A production task that forgets `APP_ENV` runs with local rules. Mitigation: the production deploy sets `APP_ENV=production` explicitly and the release guide checks it. The default is not changed.
- **Status.** `implemented`: `backend/src/config/load-config.ts`, test `load-config.test.ts` (Phase 0 review fixes).

### O33. Startup failures print a class and code, never a message

- **Choice.** `server.ts` is a thin entry; `run(env, io, createRuntime)` in `backend/src/run.ts` holds startup with injected ports (stderr, exit, signals) and a runtime factory (`runtime.ts` builds the real app and Prisma pool). A `ConfigError` prints its message (variable names and rules). Any other failure prints `Startup failed: <ErrorClass>` plus ` (code <code>)` when the error has a string or number `code`; the message is never printed because it can carry the `DATABASE_URL` with its password (rule 13). Exit code 1. A signal that arrives before `listen` runs the shutdown path once, skips `listen`, and does not print a startup failure.
- **Options.** Print the message (leaks credentials); print nothing (no diagnostics); log through the app logger (not built yet when config fails).
- **Trade-off.** Less detail on stderr: the cause chain and message are lost, the class and code remain.
- **Status.** `implemented`: `backend/src/run.ts`, `backend/src/runtime.ts`, `backend/src/server.ts`, test `backend/src/run.test.ts` (Phase 0 review fixes).

### O34. HTTP error body

- **Choice.** `registerErrorHandler` (`presentation/http/hooks/error-handler.ts`, called from `buildApp`) answers every error as `{ "error": { "code", "message" } }`. `ValidationError` 400 `validation_error`, `AuthenticationError` 401 `authentication_required`, `AuthorizationError` 403 `forbidden`, `BusinessError` 409 `business_rule_violation` (their messages are written for the client). Fastify request errors (malformed JSON, schema validation) give 400 `invalid_request` and an oversized body 413 `payload_too_large`, with fixed text because Fastify's messages can quote input. `InfrastructureError` and anything unknown give 500 `internal_error` with a generic message; the real error is logged once with its stack and the request.
- **Options.** Fastify's default handler (returns the thrown message); 422 for business errors (409 chosen: a rule conflicts with the current state, for example a held seat).
- **Trade-off.** Clients get no field-level detail for schema failures yet; add it per route when a form needs it.
- **Status.** `implemented`: `backend/src/presentation/http/hooks/error-handler.ts`, test `error-handler.test.ts` (Phase 0 review fixes).

### O35. Migrations are not in the runtime image

- **Choice.** The runtime image (O28) has neither the Prisma CLI nor the migration files, so it cannot apply migrations. Phase 1 it-1 adds a one-off migration task or image stage, run once per deploy and not at instance startup (rule 01, "Safe on every instance").
- **Options.** Migrate on container start (runs on every instance); ship the CLI in the runtime image (larger image, more attack surface).
- **Trade-off.** Until Phase 1 there is no schema, so nothing needs migrating.
- **Status.** `planned`: Phase 1 it-1.

### O36. CI boots the built image

- **Choice.** The CI job `image-smoke` builds the backend image for amd64 (`docker build -f backend/Dockerfile -t seatholder-backend:ci .`, no push) and runs `node scripts/image-smoke.mjs seatholder-backend:ci` with a `postgres:17.12` service. The script starts the image with `APP_ENV=local` and `BACKEND_PORT=3001`, polls `/api/health` for `{"status":"ok"}` (60 s bound), checks `id -u` is not 0, stops it with `docker stop` and asserts exit code 0 and a `shutdown complete` log line. A second container gets `BACKEND_PORT=abc` and a `DATABASE_URL` with a fake password and must exit 1, name `BACKEND_PORT` and print neither `abc` nor the password. The script removes its containers on every path. The Docker network comes from `IMAGE_SMOKE_DOCKER_NETWORK` (default `host`, which reaches the service on GitHub's Linux runners; `container:<id>` inside a container); the database URL from `IMAGE_SMOKE_DATABASE_URL`.
- **Options.** Rely on the `image-build` job alone (it never runs the image, so a broken entry point or a leaking startup error ships green); publish the port with `-p` (needs a host port and does not work from inside a container).
- **Trade-off.** One more CI job and a second amd64 build (no layer cache shared with the buildx job). Like `image-build` it is a CI-only exception that `scripts/verify.mjs` does not run; `scripts/verify.test.mjs` asserts its exact commands.
- **Status.** `implemented`: `scripts/image-smoke.mjs`, `.github/workflows/ci.yml`, tests `scripts/image-smoke.test.mjs` (helpers) and `scripts/verify.test.mjs` ("image smoke job"). The script passed locally against a locally built image; the job has not run on GitHub yet.

### O37. Dead template code removed

- **Choice.** Removed `LEGAL_OPERATOR_NAME`, `LEGAL_OPERATOR_ADDRESS` and `LEGAL_CONTACT_EMAIL` from `.github/workflows/ci.yml` and `verifyEnv`, and deleted `scripts/generate-auth-secrets.mjs`, `scripts/update-disposable-domains.mjs` and its test `scripts/update-disposable-domains.test.mjs` (deleted with its subject). Nothing read the variables or ran the scripts: no plan, config, README or package script referenced them. Phase 1 adds what it needs (auth secrets, a disposable-domain list) with its own tests.
- **Options.** Keep them for Phase 1 (dead code and untested secrets tooling meanwhile).
- **Trade-off.** Phase 1 writes its own generators if it needs them.
- **Status.** `implemented`: `scripts/verify.mjs`, `.github/workflows/ci.yml`, test `scripts/verify.test.mjs` ("verifyEnv"). Reason: dead template code, YAGNI.

### O38. Phase 1 dependency approvals

- **Context.** Phase 1 (auth and access) needs email delivery, CSRF protection and cookies.
- **Choice.** Approved at Phase 1 it-0: `nodemailer`, `@types/nodemailer` (dev), `@fastify/csrf-protection` and `@fastify/cookie`, each exact-pinned at the latest stable that works with Fastify 5. Only the nodemailer pair is installed now (it-1): `nodemailer` 10.6.1 in backend `dependencies` (the runtime image installs production dependencies only), `@types/nodemailer` 8.0.2 in `devDependencies`. The two Fastify plugins are installed by the iteration that uses them (it-4, it-5), each recorded here when it lands.
- **Options.** Hand-written SMTP client or CSRF scheme (rejected by rule 40: no custom crypto or CSRF); installing all four now (unused dependencies until it-4).
- **Trade-off.** `nodemailer` adds one runtime dependency with no transitive packages; `@types/nodemailer` pulls in type-only packages.
- **Status.** `implemented` for the nodemailer pair: `backend/package.json`, `package-lock.json`. The Fastify plugins are `planned`: Phase 1 it-4 and it-5.

### O39. Email provider port, adapters and factory

- **Context.** Auth sends login codes by email. Plan section 2: `console` for tests, `smtp` for Mailpit locally and SES SMTP in production; `console` in production must fail.
- **Choice.** Port `EmailProvider.send({ to, subject, text })` in `backend/src/modules/auth/application/ports/email-provider.ts`; it has no auth-code method (the login-code template belongs to the login service, it-3). `SmtpEmailProvider` takes an injected transporter and sends from `EMAIL_FROM`; a transport failure becomes `InfrastructureError("Email delivery failed (<CODE>)")`, with only a short upper-case error code (for example `EAUTH`) and no cause, because the nodemailer error can quote credentials or the message. `ConsoleEmailProvider` writes the whole message, body included, to an injected writer; it exists so tests can read the code, and the factory never builds it in production. `createEmailProvider(config, deps)` picks by `EMAIL_PROVIDER` and throws for `console` when `APP_ENV=production`; `loadConfig` refuses the same combination first (defense in depth, each tested). Config: `EMAIL_PROVIDER` (`console`|`smtp`, default `smtp`), `EMAIL_FROM` (default `no-reply@seathold.local`, must look like an address), `SMTP_HOST` (`localhost`), `SMTP_PORT` (1-65535, `1025`), `SMTP_USER` and `SMTP_PASS` (optional, set together; the missing half is named). `SMTP_PASS` is a secret: not in `.env.example`, production injects it. `SMTP_USER` is also left out of the example because local Mailpit needs no login. `env-example.test.ts` lists both as intentionally undocumented, and asserts `SMTP_PASS` never appears in the example.
- **Options.** Default `console` locally (hides misconfiguration; Mailpit is the local default per the plan); keep the transport error as `cause` (leaks risk); an extra production rule on `SMTP_HOST` (kept simple, no rule beyond console refusal and the credential pair); a native SES API adapter (not now, the port allows it later).
- **Trade-off.** Dropping the cause loses the original SMTP diagnostic; the error code is the only detail kept. Not wired into `runtime.ts` yet: it-3 needs it.
- **Status.** `implemented`: `backend/src/modules/auth/` (`application/ports/email-provider.ts`, `infrastructure/email/*`, `index.ts`), `backend/src/config/load-config.ts`, `.env.example`; tests `smtp-email-provider.test.ts`, `console-email-provider.test.ts`, `create-email-provider.test.ts`, `load-config-email.test.ts`, `env-example.test.ts`.

### O40. Auth schema and the citext approach

- **Context.** Phase 1 needs `users`, `auth_codes` and `sessions` (plan section 5). Emails must be unique regardless of case; Prisma cannot model CHECK constraints.
- **Choice.** Migration `backend/prisma/migrations/20261126120000_auth_schema/migration.sql` starts with `CREATE EXTENSION IF NOT EXISTS citext`. Emails are `citext` through Prisma's `@db.Citext` with the `postgresqlExtensions` preview feature (`extensions = [citext]` in the datasource), so the schema file and the database agree and `prisma migrate diff --from-config-datasource --to-schema` reports no difference. The generated SQL was edited by hand only to drop the redundant `CREATE SCHEMA` line and to append the two CHECK constraints Prisma cannot express: `users_role_check` (`role IN ('buyer','admin')`) and `auth_codes_attempts_check` (`attempts >= 0`). The DESC index comes from `@@index([email, createdAt(sort: Desc)])`. `sessions.user_id` is a foreign key `ON DELETE CASCADE`; `users.email` and `sessions.token_hash` are unique. All timestamps are `timestamptz(3)` with no database default: the caller passes the injected `now`, so no statement calls `now()` and tests control time. Ids default to `gen_random_uuid()`. Roles are `text` plus CHECK, not a Postgres enum (adding a role is a one-line constraint change, no enum migration).
- **Options.** `Unsupported("citext")` (no typed queries, raw SQL everywhere); `lower(email)` unique index (every query must remember `lower`); a Postgres enum for roles.
- **Trade-off.** One preview feature flag in the generator. The CHECKs live only in the migration; a later `migrate dev` keeps them (they are not in the schema, so Prisma does not drop them), but editing the schema never shows them. Tests assert them. citext is a trusted extension, so the database owner can create it on PostgreSQL 17 (Docker, Homebrew, RDS).
- **Growth.** `auth_codes` gains a row per login-code request and is never deleted yet. A purge of rows older than one day, in bounded batches on `created_at`, is a later item (the retention filter will need an index on `created_at`; add it with that job). `sessions` grows per login; expired rows stay until a purge job exists.
- **Status.** `implemented`: `backend/prisma/schema.prisma`, the migration above; tests `auth-schema.integration.test.ts` (case-insensitive email, role CHECK, attempts CHECK, unique token hash, cascade delete, DESC index).

### O41. Auth repositories and concurrency rules

- **Context.** The login and session services (it-3, it-4) and the admin CLI (it-6) need persistence behind ports, with races settled in the database.
- **Choice.** Ports in `backend/src/modules/auth/application/ports/` (`UserRepository`, `LoginCodeRepository`, `SessionRepository`) carry only the methods those iterations need and take `now: Date` wherever time matters. Prisma implementations in `infrastructure/persistence/` map rows to domain classes (`User`, `LoginCode`, `Session`, `ActiveSession`) through stateless mapper functions; Prisma records never leave the layer. Email is normalised by one helper (`normalizeEmail`: trim) and compared by citext in the database (`emailsEqual` for code). Concurrency: `createBuyer` is `INSERT ... ON CONFLICT DO NOTHING` (`createMany` with `skipDuplicates`) then a read, so concurrent calls yield one user; `consume` is one conditional `UPDATE ... WHERE id AND consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > $now` and returns true for exactly one caller; `incrementAttempts` is an atomic `attempts + 1`; `revoke` only touches rows with `revoked_at IS NULL`, keeping the first revocation time. `findLatestValid` leaves the attempt limit to the service. Every repository call goes through `guarded()`, which turns driver failures into `InfrastructureError` carrying the operation name and a short code only, never SQL, values or the cause.
- **Options.** Raw `$queryRaw` for the conditional updates (Prisma `updateMany` already issues one conditional UPDATE and keeps the code typed); read-then-write in application code (banned by the locking rules).
- **Trade-off.** Dropping the driver error as `cause` loses diagnostics; the short code and operation name are kept. `setRoleByEmail` reports false both for an unknown email and a role already set (the CLI needs to tell these apart later by calling `findByEmail`).
- **Status.** `implemented`: `backend/src/modules/auth/{domain,application/ports,infrastructure/persistence}`, `index.ts`; tests `prisma-user-repository.integration.test.ts`, `prisma-login-code-repository.integration.test.ts`, `prisma-session-repository.integration.test.ts`, `email.test.ts`, `role.test.ts`. The `*-test-support.ts` helper is excluded from the build in `backend/tsconfig.build.json`.

### O42. Login code configuration and the pepper

- **Context.** Login codes are stored as keyed hashes (O43). The key (the pepper) and the request limits must come from configuration, validated at startup (rules 01 and 13).
- **Choice.** `AUTH_CODE_PEPPER` is a secret, required in every environment, at least 32 characters; the config error names the variable and never prints the value. In production `loadConfig` also refuses the exact local placeholder `localPepperPlaceholder` that `.env.example` carries, so copying the example to production fails at startup. `.env.example` is the one place a secret variable gets a value: a placeholder, commented as local only; production injects the real pepper from the secret store. `env-example.test.ts` lists it explicitly (`secretsWithLocalPlaceholder`) and asserts the example value equals the constant the production rule rejects. `SMTP_PASS` stays out of the file. `AUTH_REQUEST_CODE_LIMIT` (5), `AUTH_REQUEST_CODE_WINDOW_MINUTES` (15) and `AUTH_REQUEST_CODE_COOLDOWN_SECONDS` (60) are positive integers. `AppConfig` gains `authCodePepper` and the three limits. The pepper is passed into `HmacLoginCodeHasher` by composition (also refusing a pepper under 32 characters); the services never read the environment. `.env.manager` carries a test pepper; `scripts/image-smoke.mjs` passes a throwaway one (`smokeEnv`) so the CI image smoke still starts, since the workflow file is not changed.
- **Options.** A local default pepper in code (a weak default would reach production silently); required only in production (local and test runs would then hash with an empty or default key); a separate rotation scheme (not now: rotating the pepper invalidates only outstanding 10-minute codes, which is harmless).
- **Trade-off.** Every environment, including tests that build a config, must supply a pepper. The placeholder is public, so local hashes are not secret, which is the point of "local only".
- **Status.** `implemented`: `backend/src/config/load-config.ts`, `.env.example`, `scripts/image-smoke.mjs`; tests `load-config-auth.test.ts`, `env-example.test.ts`, `image-smoke.test.mjs` (`smokeEnv`), `hmac-login-code-hasher.test.ts`.

### O43. Login codes: format, hashing, limits, attempts, expiry, enumeration

- **Context.** Plan sections 2 and 6 (flows 1, 2, 6), Phase 1 it-3.
- **Choice.** *Format and hash.* A code is six digits from `crypto.randomInt(1_000_000)`, zero-padded (`RandomLoginCodeGenerator`). Stored value: HMAC-SHA256 of the code keyed with the pepper, hex (`HmacLoginCodeHasher`); the plaintext exists only in the email body and never reaches the repository, logs or results. Comparison goes through `safeEqualHex` (`crypto.timingSafeEqual`, different lengths are simply unequal). *Expiry.* Ten minutes after the single `Clock.now()` read, a fixed domain constant (`LOGIN_CODE_TTL_MINUTES`), not configuration; `findLatestValid` and `consume` compare against the same `now`. *Request limit.* Counted from `auth_codes` (so it holds across instances): at least `AUTH_REQUEST_CODE_LIMIT` codes created for the email in the last `AUTH_REQUEST_CODE_WINDOW_MINUTES` blocks the next one (the 6th with the default), and so does a latest request younger than `AUTH_REQUEST_CODE_COOLDOWN_SECONDS`. The result is a value, `{ kind: "rate_limited", retryAfterSeconds }`, the larger of the two waits, rounded up, at least 1; the window wait is when the oldest request in the window leaves it, read through the new port method `oldestCreatedAtSince`. A request that passes invalidates earlier unused codes, stores the new hash, and sends the email (template in `login-code-email.ts`). *Enumeration.* The request service never reads users: a known and an unknown address take the same path and get the same result, including the same rate-limited answer. *Verify.* Latest valid code for the email; none, or 5 attempts used, or a wrong code, or a lost consume race all give the one result `invalid_code`. A wrong code adds an attempt, and the fifth kills the code even for the right value. A right code is consumed by the conditional update (O41), then the user is found or created as `buyer`; no role comes from input. Sessions are Phase 1 it-4. *Delivery failure.* An `InfrastructureError` from the provider propagates; any other provider error becomes a new `InfrastructureError` without message or cause, so a body containing the code cannot leak. The code row stays, so a failed send still counts toward the limit.
- **Options.** Hash bound to the email as well as the pepper (more complex, little gain against a keyed hash); throwing for rate limit (the HTTP layer needs `retryAfterSeconds`, a result is simpler); a retry-after from `latest + window` (no new port method, but overstates the wait by minutes); deleting the row when sending fails (an extra write, and it would let a broken mailer bypass the limit).
- **Trade-off.** Concurrent requests can pass the count check together and exceed the limit by the number of racers; the cooldown and WAF rate rules at the edge bound this, and an exact limit would need a lock or advisory lock per email (not now). Concurrent wrong guesses can overshoot 5 attempts by the same few. Codes live in a 10^6 space: the 5-attempt cap, the 10-minute life and the request limit are the defence. The earlier-code invalidation and the new row are separate statements; a crash between them leaves no valid code, and the user requests again.
- **Status.** `implemented`: `backend/src/modules/auth/application/{request-login-code-service,verify-login-code-service,login-code-email}.ts`, `application/ports/{login-code-generator,login-code-hasher,login-code-repository}.ts`, `infrastructure/crypto/*`, `domain/{email,login-code}.ts`, `infrastructure/persistence/prisma-login-code-repository.ts`; tests `request-login-code-service.test.ts`, `verify-login-code-service.test.ts`, `login-code-lifecycle.integration.test.ts`, `timing-safe.test.ts`, `hmac-login-code-hasher.test.ts`, `random-login-code-generator.test.ts`, `email.test.ts`, `prisma-login-code-repository.integration.test.ts`. The in-memory fakes are `application/in-memory-auth-test-support.ts` (excluded from the build).

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
