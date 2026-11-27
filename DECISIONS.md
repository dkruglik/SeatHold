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
- **Choice.** `UPDATE seats SET status='held', hold_id=$hold, held_until=$expires WHERE id=$seat AND event_id=$event AND (status='available' OR (status='held' AND held_until <= $now)) RETURNING id`. `$now` is the value read once from the `Clock` for the operation (O4). Zero rows means the seat is taken (409). The holder's hold row is created with `INSERT ... ON CONFLICT DO NOTHING` on a partial unique index, so parallel first clicks of one holder share one hold. Confirm uses the same pattern: `UPDATE seats SET status='sold', held_until=NULL WHERE hold_id=$hold AND status='held' AND held_until > $now RETURNING id`, inside a transaction that first locks the active hold row (`SELECT ... FOR UPDATE`); the number of returned rows must equal the hold's seat count, otherwise the transaction rolls back. `UNIQUE(seat_id)` on `tickets` is the backstop: a violation rolls the whole confirm back, maps to 409 `HOLD_EXPIRED` and voids the payment. No application-side check-then-write anywhere.
- **Seat cap race (changed from the plan).** The plan checked the cap against a count taken while getting the hold. Two parallel clicks of one holder could both read the old count and both pass. The hold row is now locked first (`SELECT id, expires_at FROM holds ... FOR UPDATE`, in `findActiveHold`) and the seats are counted in a second statement, so under READ COMMITTED the second click sees the first click's committed seat. The cap integration test found the race.
- **Hold transaction.** One transaction per click: expire the holder's stale hold, get or create the active hold (`INSERT ... ON CONFLICT DO NOTHING`, no conflict target, the two partial unique indexes arbitrate, then the locking select), check the cap (409 `HOLD_LIMIT_REACHED`), run the conditional seat UPDATE (zero rows throws `SeatUnavailable`, 409 `SEAT_UNAVAILABLE`, and the throw rolls back a hold created in the same transaction, so no empty hold stays). Transaction `maxWait` and `timeout` are 10 s (O66).
- **Trade-off.** All contention lands on PostgreSQL row locks; a very hot seat serializes on one row (fine at this scale, see Scale). One statement per clicked seat instead of a batch.
- **Status.** `implemented` (Phase 2 it-3, it-5). Files: `backend/src/modules/booking/infrastructure/persistence/{prisma-hold-repository.ts,prisma-checkout-repository.ts,checkout-statements.ts}`, `application/{hold-seat-service.ts,checkout-service.ts}`. Tests: `prisma-hold-repository.hold-concurrency.integration.test.ts` (100 parallel holds from 100 visitors on one seat give exactly 1 success and 99 `SEAT_UNAVAILABLE`, and the seat row points at the winner's hold; a sold seat cannot be held; two parallel clicks of one holder on two seats make one hold with both), `prisma-hold-repository.hold-cap.integration.test.ts` (cap, also under parallel clicks), `prisma-checkout-repository.races.integration.test.ts` (two concurrent checkouts of one hold make one booking; the ticket backstop test forces a second ticket for an already ticketed seat, gets 409 `HOLD_EXPIRED` and a full rollback), `catalog-booking-schema.integration.test.ts` (`UNIQUE(seat_id)` and `UNIQUE(code)` on tickets, `UNIQUE(hold_id)` on bookings).

### D2. Where hold state lives and how expiry fires

- **Context.** A hold lasts X minutes (default 10); after that the seats return to sale, deterministically.
- **Options.** TTL store (Redis keys with expiry); scheduled sweeper; lazy expiry on read; queue with delayed messages.
- **Choice.** Hold state lives on the seat row (`hold_id`, `held_until`) and in a `holds` row (`expires_at`). **Lazy expiry**: every read and write treats `held_until <= now` as available, so correctness never depends on a background job. An idempotent sweeper exists for tidiness only (O64); nothing schedules it yet, production would run it once from EventBridge Scheduler. The one expiry rule is `isExpired(expiresAt, now)`: a hold is over at exactly `expires_at` (`<=`). The public seat map (`GetSeatMapQuery`) derives `available` for an expired hold from the row's `held_until` and the operation's `now`; the viewer's own hold (`GetCurrentHoldQuery`) is read with `expires_at > $now`; the hold transaction first marks the holder's stale active hold `expired` and frees its seats. `now` is read once per operation from an injected `Clock` (database time in the running app, a controlled clock in tests) and passed to every statement, the sweeper included; no SQL statement calls `now()` itself.
- **Trade-off.** Expired rows stay `held` in storage until touched or swept, so every query and admin count must apply the same rule. No push notification when a hold expires; the UI relies on its countdown and polling.
- **Status.** `implemented` (Phase 2 it-2, it-4). Files: `backend/src/modules/booking/domain/{hold-rules.ts,seat-state.ts}`, `application/{get-seat-map-query.ts,get-current-hold-query.ts,expire-holds-service.ts}`, `infrastructure/persistence/{prisma-hold-repository.ts,prisma-seat-map-reader.ts,prisma-current-hold-reader.ts,prisma-hold-sweeper.ts}`. Tests: `prisma-hold-repository.kpi-expiry.integration.test.ts` (with a `ControlledClock`, another visitor holds the seat 1 second after the hold duration, run twice with the same result; the seat is still held at `expires_at` minus 1 second and free at exactly `expires_at`; no real waiting), `application/expiry-and-reads.test.ts`, `seat-state.test.ts`, `hold-rules.test.ts`, `prisma-seat-map-reader.integration.test.ts`, `prisma-current-hold-reader.integration.test.ts`.

### D3. Caching

- **Context.** Search and seat maps are read-heavy; holds and payments must always be exact.
- **Options.** No cache; in-process memory cache (breaks with several instances); CDN edge cache; Redis or ElastiCache.
- **Choice (written; building it is optional).**
  - Cached: show search results per normalized query for 30 s, facets for 5 min, event detail for 60 s; public seat availability per event for 1-2 s at CloudFront. Keys include every filter and the page.
  - Invalidated on: admin event creation or price change (event detail, search, facets).
  - Seat API split to match: `GET /api/events/:eventId/seats` is public and identical for every viewer, so it can be cached; the viewer's own hold comes from `GET /api/events/:eventId/hold` (never cached) and is merged in the browser.
  - **Never cached:** holds, the viewer's own `held_by_me` state, checkout, payments, sessions, `/api/auth/me`, My bookings, guest pages, anything under `/api/admin`.
- **What the code does today (O111).** No cache layer exists: no CloudFront, no Redis, no in-process cache. The backend only sets `Cache-Control` headers: `public, max-age=1` on search, event detail and the seat map, `public, max-age=60` on facets, `no-store` on every other route listed under "Never cached" that exists (`/api/auth/me`, holds, release, checkout, CSRF token, My bookings, guest exchange and booking, every `/api/admin` route). The TTLs written above (30 s, 5 min, 60 s) are the targets for an edge cache in front of these routes; the headers today are shorter (1 s) on purpose, so a browser cache never adds more than about a second on top of any later edge TTL. Details, gaps and the invalidation story are in O111.
- **Trade-off.** A seat map can be up to 2 s stale; a click on a seat that was just taken returns 409 and the map refreshes. No in-process cache, to keep instances stateless.
- **Status.** `planned` (Phase 5 it-3): the policy is written; the cache layer is not built and not scheduled. `implemented` only for the response headers (O111).

### D4. Late payment

- **Context.** Payment succeeds 3 seconds after the hold expired, and the seat is already held by another buyer.
- **Options.** Honour the payment and take the seat back (sells a seat the other buyer holds); move the buyer to other seats automatically; reject and refund.
- **Choice.** `CheckoutService` reads the clock twice. The first value serves the hold lookup, the expiry check (`expires_at <= now` gives 409 `HOLD_EXPIRED` before any payment) and the price. The mock payment is then authorized outside any database transaction, with the idempotency key `hold:<holdId>`. The second clock value is read after authorize returns and is used for the confirm and for every record written afterwards, so a hold that lapsed during the payment is rejected rather than sold. The confirm transaction requires every seat of the hold to still be `held` by it with `held_until > now`. If fewer rows match (`seats_lost`), the transaction rolls back, a second transaction marks the hold `expired`, frees its seats, inserts the booking as `rejected` and upserts the payment as `voided`, and the buyer gets 409 `HOLD_EXPIRED` with the map refreshed to choose again. A failed payment records the payment `failed`, leaves the hold and seats unchanged and answers 402 `PAYMENT_FAILED` (the buyer may retry; the retry overwrites the `failed` row, a `succeeded` row is never overwritten). A `UNIQUE` violation in the confirm (the ticket backstop, or a booking that already exists for the hold) rolls back, voids the payment and answers 409 `HOLD_EXPIRED`. When the hold is no longer active at confirm (another checkout won the race, or it was released), the confirm returns `hold_gone`; the service records the payment as `voided` (`voidPayment`, which never overwrites a `succeeded` row, so the winning checkout's row stays) and then answers 404 `HOLD_NOT_FOUND`. The payment upsert is idempotent: `INSERT ... ON CONFLICT (idempotency_key) DO UPDATE ... WHERE outcome <> 'succeeded'`.
- **Trade-off.** A buyer who paid a little late loses the seats and must start again; no automatic substitute seats. A real provider would need a refund or void call, made idempotent with the payment's idempotency key. Remaining gap: the `voided` row is only the audit record; a real provider would also need a void or refund call at the provider after `hold_gone`, which the `PaymentGateway` port does not have yet. The two clock reads cost one extra read per checkout.
- **Status.** `implemented` (Phase 2 it-5). Files: `backend/src/modules/booking/application/checkout-service.ts`, `infrastructure/persistence/{prisma-checkout-repository.ts,checkout-statements.ts}`, `infrastructure/payment/mock-payment-gateway.ts`. Tests: `application/checkout-service.test.ts` (clock read once per phase, before and after authorize; seats lost during payment gives rejection; backstop voids; `hold_gone` records a voided payment before the 404), `prisma-checkout-repository.races.integration.test.ts` (late payment with the seat retaken: booking `rejected`, payment `voided`, the other holder's seat untouched, no tickets; a payment finishing after expiry is rejected even when nobody retook the seat), `prisma-checkout-repository.integration.test.ts` (success, failed payment, retry after failure, expired hold without payment).

### D5. Guest one-time link

- **Context.** Guests buy with an email only and receive a link that shows the ticket and its QR.
- **Options.** Single view (dies after first view); **single exchange into a session**; reusable until expiry.
- **Choice.** The email link carries a random 32-byte token in the URL fragment (kept out of server logs and Referer). Opening it posts the token once to `/api/guest/exchange`, which consumes it and sets a guest session cookie scoped to that one booking, valid until the event start plus 1 day. The link can be exchanged within 168 h. A lost link is replaced via "send me a new link" with the email: answers 204 for every well-formed email (429 with `Retry-After` once the per-email limit is reached, O74), sends new links for upcoming guest bookings, invalidates older unused links, and revokes existing guest sessions for those bookings. Only token hashes are stored.
- **Trade-off.** More moving parts than a plain link (exchange, guest session, resend). A guest who clears cookies needs a new link. Forwarding a used link does not share the ticket. Requesting a new link logs out a guest session on another device.
- **Status.** `implemented`: Phase 3 it-3, it-8; the details, trade-offs and deviations are in O73 and O74, the resend limit in O74, the screens in O79. Decided 2026-11-26.

### D6. Data store and consistency guarantees

- **Context.** One source of truth for seats, holds, bookings, users and sessions.
- **Options.** PostgreSQL only; PostgreSQL plus Redis for holds or sessions; a document store.
- **Choice.** PostgreSQL 17 only (Prisma behind repositories). Guarantees relied on: row-level locks taken by `UPDATE` (concurrent updates of one row serialize, and the second re-evaluates the `WHERE` under READ COMMITTED); atomic transactions for confirm; `UNIQUE`, `CHECK` and foreign-key constraints for invariants (one ticket per seat, a held seat always has a hold, one active hold per holder and event); the database clock, read once per operation through the `Clock` port (O4), as the single time source for expiry in production. The Phase 2 schema (`backend/prisma/migrations/20261126130000_booking_schema/migration.sql`) adds `UNIQUE(event_id, row_label, seat_number)` on seats, the `seats_hold_consistency_check` (`(status='held') = (hold_id IS NOT NULL AND held_until IS NOT NULL)`), the holder check on holds (exactly one of `user_id`, `visitor_hash`), partial unique indexes for one active hold per holder and event, `UNIQUE(hold_id)` on bookings, `UNIQUE(seat_id)` and `UNIQUE(code)` on tickets, `UNIQUE(idempotency_key)` on payments, and the status and outcome CHECKs. Timestamp columns have no defaults: callers pass the injected `now`. Foreign keys and extra indexes: O65.
- **Trade-off.** One writer database is the scaling limit for the hold path; session lookups and polling also land on it until a cache is approved (see Scale).
- **Status.** `implemented`: Phase 0 it-3, Phase 1 it-2, Phase 2 it-1. Phase 2 tests: `backend/src/modules/catalog/infrastructure/persistence/catalog-schema.integration.test.ts` and `catalog-booking-schema.integration.test.ts` (each constraint rejects its violating row), plus the concurrency tests named in D1.

---

## Engineering KPIs

| KPI | Target | How it is shown | Status |
|---|---|---|---|
| Oversell | 0 seats sold twice | Test: 100 parallel holds on one seat produce exactly 1 winner | `implemented` Phase 2 it-3: `prisma-hold-repository.hold-concurrency.integration.test.ts` (D1) |
| Hold expiry | Seat back on sale after X minutes, same result every run | Test with a controlled clock, no real waiting | `implemented` Phase 2 it-4: `prisma-hold-repository.kpi-expiry.integration.test.ts` (D2) |
| Time to first run | Clean Mac to running system < 10 min | `install-seathold` skill, timed run | `planned` Phase 0 it-7, Phase 5 it-1 |
| Caching | See D3 and O111 | Written; the response headers are in code | `planned` Phase 5 it-3 (headers `implemented`, O111) |
| Latency | Search `GET /api/shows` p95 < 150 ms server time; seat hold p95 < 50 ms; checkout p95 < 200 ms excluding the payment provider | Written, not measured (O112) | `planned` Phase 5 it-3 |
| Latency threats | The hold transaction itself (counted from the code: 9 database round trips for an anonymous holder, 10 for a signed-in one, O112), hot seat rows at on-sale, seat-map polling on the writer, connection-pool exhaustion behind RDS Proxy, full-text query plans at larger catalog size | Written (O112) | `planned` Phase 5 it-3 |
| Scale | See Scale section and O113 | Written | `planned` Phase 5 it-3 |
| Security | See Security section | Code + written | `implemented` Phase 1 (O56) |
| Own KPI | Hold-to-purchase conversion and hold expiry rate per event: shows whether the 10-minute window and checkout work, and detects seat hoarding. Exact definition and read-only SQL: O114. Alternatives considered: p99 click-to-held time; QR fetch success rate | Written; computable from `holds` today, no dashboard built | `implemented` as a written decision (O114); default recorded in Phase 5 it-0, no person has confirmed or replaced it |

---

## Security

### Implemented controls

| Control | Decision | Status |
|---|---|---|
| Login | Passwordless 6-digit email codes (`crypto.randomInt`), HMAC-SHA256 with a pepper, 10 min, 5 attempts, single use; a new request invalidates older codes | `implemented` Phase 1 it-3 (O42, O43) |
| Code request limit | Database-backed: 5 per 15 min per email, 60 s cooldown (holds across instances). Answers 204 for any well-formed email; over the limit 429 with retry time for any email string, so neither response reveals whether an account exists | `implemented` Phase 1 it-3 (O42, O43) |
| Sessions | Random 32-byte token in `HttpOnly`, `SameSite=Lax`, `Secure` (production) cookie on `/api`; only the SHA-256 stored; rotated on login; fixed 30-day lifetime, no idle timeout (O19); logout and logout-all revoke immediately | `implemented` Phase 1 it-4 (O44, O45) |
| CSRF | `@fastify/csrf-protection` double-submit token in `X-CSRF-Token`, plus Origin check, on every state-changing browser request; 403 otherwise | `implemented` Phase 1 it-5 (O46, O47, O48) |
| Back-office authorization | Server-side: one `/api/admin/*` plugin with a prefix hook (`requireAuth` then `requireRole('admin')`), role read from the database per request; 401 anonymous, 403 buyer. One test enumerates every admin route | `implemented` Phase 1 it-6 (O49) |
| Admin grant | Only seed or CLI (`npm run user:promote`); sign-up always creates `buyer`; no HTTP route changes roles | `implemented` Phase 1 it-6 (O50, O51) |
| Guest link | Unguessable 32-byte token, hashed, single exchange, expiring; resend revokes existing guest sessions (D5) | `implemented` Phase 3 it-3 (O73, O74) |
| Log redaction | Pino redacts `Cookie`, `Set-Cookie`, `X-CSRF-Token` and `Authorization`; request bodies (codes, tokens) are never logged | `implemented` Phase 0 it-4: `backend/src/infrastructure/logging/logger-options.ts`, test `backend/src/presentation/http/log-redaction.test.ts` |
| CORS | Closed: no CORS plugin, one origin for frontend and API (O5) | `implemented` Phase 0 it-4: `backend/src/app.ts`, test `backend/src/app.test.ts` |
| QR payload | Random 128-bit ticket code (base64url), unique, not derived from ids, so it cannot be guessed or enumerated | `implemented` as issuing in Phase 2 it-5: `backend/src/modules/booking/domain/ticket-code.ts` (16 random bytes from Node crypto, base64url), `UNIQUE(code)` on tickets; test `ticket-code.test.ts`. Showing it as a QR is `implemented` in Phase 3 it-8 (O79) |
| Anonymous holders | Random visitor token cookie, hashed in the database; a holder can only touch their own hold (404 otherwise) | `implemented` Phase 2 it-6 (O59): `booking/presentation/http/hooks/{visitor-token.ts,holder-hooks.ts}`; tests `release-seat.route.integration.test.ts`, `checkout.route.integration.test.ts`, `current-hold.route.integration.test.ts` (another visitor gets 404) |
| Secrets | None in the repository, images, CI logs or `VITE_*`; production reads them from AWS Secrets Manager or SSM Parameter Store | `planned` Phase 0 it-1, it-3 |
| Input validation | Fastify JSON schemas (Ajv) at every HTTP boundary, with `additionalProperties: false` and `propertyNames` where unknown fields must be rejected (O57, O70), plus explicit bounds (grid size, price, page size, date ranges: O70, O86) | `implemented` Phase 1 to 4; zod is used only for the environment configuration (`backend/src/config/load-config.ts`) |

### Before production (written, not built)

The Phase 1 summary and its open risks are in O56.

- AWS WAF rate rules at the edge (in-process limits do not hold across instances).
- Idle timeout for admin sessions; a fresh code before destructive admin actions.
- General audit log of admin actions (only the manual seat release is logged, in `seat_release_log`, O98).
- Purge jobs for old login codes (rows older than a day, bounded batches, index on `created_at`), expired holds and guest links (bounded batches).
- Real payment provider: webhook signature checks, idempotency keys, refunds.
- Container image scanning in CI. Dependency audit and Semgrep already run in CI (`.github/workflows/ci.yml`, `scripts/security-scan.mjs`); the image is not scanned.

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
- **Status.** `planned` (Phase 5 it-3, written only; the reasoning against the code, the order of failures and the full AWS list are in O113). Design invariants that keep this path open are already agreed (see O3).

---

## Other design decisions

### O1. Stack and architecture

- **Choice.** Backend: Node 24, TypeScript, Fastify, Prisma, PostgreSQL. Frontend: React, TypeScript, Vite. Tests: Vitest. npm workspaces. A modular monolith with explicit modules (`auth`, `catalog`, `booking`, `guest-access`, `backoffice`).
- **Options.** Microservices; NestJS; Next.js full stack.
- **Trade-off.** One deployable is simpler and fits 4-6 hours; module boundaries keep later extraction possible.
- **Status.** `planned`: Phase 0 to Phase 4. In place after Phase 0: npm workspaces, Fastify, Prisma, React, Vite and Vitest (`package.json`, `backend/package.json`, `frontend/package.json`; run by `npm run verify-fast-part`). The `auth` module exists (`backend/src/modules/auth/`: domain, application, infrastructure, presentation; Phase 1). Missing: the `catalog`, `booking`, `guest-access` and `backoffice` modules, which arrive in later phases, so no test proves the module layout yet.

### O2. Authentication model

- **Choice.** Passwordless email codes for everyone, server-side sessions in PostgreSQL, one login flow; admins are normal users with `role='admin'`.
- **Options.** Passwords (hashing, reset flows); OAuth (external setup on a clean Mac); JWT in browser storage (no immediate revocation, XSS exposure); a separate admin login page (reveals which emails are admins).
- **Trade-off.** Demo logins need the local mail catcher (Mailpit) to read the code; the install skill prints its URL.
- **Status.** `implemented` (Phase 1): email codes, server-side sessions in PostgreSQL and the `role` column behind one login flow; admins are users with `role='admin'` (no separate admin login). Files: `backend/src/modules/auth/`, `frontend/src/features/auth/`; tests `auth-login-routes.integration.test.ts`, `auth-session-routes.integration.test.ts`, `auth-code-limits-routes.integration.test.ts`, `login-code-lifecycle.integration.test.ts`, `login-page.test.tsx`, `guards.test.tsx`. Details in O40 to O56.

### O3. Production target and invariants (AWS, not deployed)

- **Choice.** Designed for AWS: S3 + CloudFront (frontend, `/api/*` routed to the ALB), ECS Fargate behind an ALB (backend), RDS or Aurora PostgreSQL 17 with RDS Proxy, SES, Secrets Manager or SSM, CloudWatch, WAF. Invariants enforced by the rules: no request, session, hold, cache or rate-limit state in process memory; the API always under `/api` on the frontend origin; database time for expiry; startup work and scheduled jobs idempotent or run once; configuration only from environment.
- **Options.** No named target, hosting-agnostic only (the scale answer would stay vague); a single virtual machine with Docker Compose (simplest, but no horizontal scaling or managed database story); serverless functions behind API Gateway (cold starts and many short-lived PostgreSQL connections on the hot hold path).
- **Trade-off.** Some local conveniences are off the table (in-memory caches, per-process counters). Deployment itself is out of scope.
- **Status.** `planned`: Phase 0 it-3, it-4, it-6. In place: configuration only from environment (`backend/src/config/load-config.ts`, test `load-config.test.ts`), database time (O4), everything under `/api` (O5), the stateless backend image (O28, `scripts/dockerfile-hygiene.test.mjs`). Missing: the arm64 image build is checked only by the CI `image-build` job and is not proven on the development host; the no-in-memory-state invariant has no test until Phase 1 and later add state; the AWS target itself is documentation only.

### O4. Clock source

- **Choice.** A `Clock` port: production reads `clock_timestamp()` from PostgreSQL once per operation and passes the value to every statement of that operation; tests use a controlled clock. No SQL statement calls `now()` itself.
- **Options.** Host clock (`Date.now()`) everywhere.
- **Trade-off.** One extra cheap query per operation; in return several instances with skewed host clocks agree on expiry, and tests stay deterministic.
- **Status.** `implemented`: `backend/src/shared/time/` (`Clock`, `DatabaseClock`, `ControlledClock`), tests `controlled-clock.test.ts` and `database-clock.integration.test.ts` (Phase 0 it-4). `DatabaseClock` is built in `runtime.ts` (and `scripts/script-runtime.ts`) and passed to `buildApp` and `createAuthServices`; the auth services read it once per operation (O43, O44).

### O5. One origin for frontend and API

- **Choice.** All routes under `/api`; Vite proxy locally, CloudFront path routing in production. No CORS plugin is installed, so cross-origin browser calls are refused. The health check is `GET /api/health` as well (container check, ALB target group, install skill), so the proxy and CloudFront route one path prefix; there is no separate `/health`.
- **Options.** Separate API domain with credentialed CORS.
- **Trade-off.** Needs path routing at the edge; in return session cookies stay first-party with `SameSite=Lax` and CORS stays closed.
- **Status.** `implemented`: `backend/src/app.ts` registers every route under `/api` and no CORS plugin; tests `app.test.ts` (`/health` is 404, no CORS headers) (Phase 0 it-4). `frontend/vite.config.ts` proxies `/api` to `http://127.0.0.1:${BACKEND_PORT}` (default 3001) with the dev server on 5173; test `frontend/vite.config.test.ts` (Phase 0 it-5).

### O6. Hold model on the seat map

- **Choice.** Hold on click: each click holds that seat at once and adds it to the holder's single active hold for the event; all seats share the expiry set when the hold was created. Holder is a signed-in user or an anonymous visitor cookie.
- **Options.** Select locally, then hold all at once (conflicts appear late, map stale while choosing); a timer per seat (several countdowns, partial expiry at checkout).
- **Trade-off.** One write per click; adding a seat late does not extend the timer.
- **Status.** `implemented`: Phase 2 it-3 (`hold-seat-service.ts`, `release-seat-service.ts`; tests `hold-and-release.test.ts`, `prisma-hold-repository.hold-concurrency.integration.test.ts`, `prisma-hold-repository.release.integration.test.ts`). Decided 2026-11-26. A seat added later keeps the hold's `expires_at`.

### O7. Seat cap per hold

- **Choice.** `MAX_SEATS_PER_HOLD`, default 10, enforced in the hold service.
- **Options.** No limit; a per-buyer-per-show limit now.
- **Trade-off.** A buyer can still open holds on several events; per-buyer-per-show limits are left as a later change.
- **Status.** `implemented`: Phase 2 it-3 (`hold-rules.ts` `assertSeatCapNotExceeded`, config `MAX_SEATS_PER_HOLD`; tests `hold-rules.test.ts`, `prisma-hold-repository.hold-cap.integration.test.ts`). Decided 2026-11-26. The cap race and its fix are in D1.

### O8. Mock payment

- **Choice.** A `PaymentGateway` port with a mock adapter whose outcome the buyer picks (succeed or fail); authorization outside the database transaction; idempotency key per hold (`hold:<holdId>`, so a retry after a failed payment reuses and overwrites the same payment row, never a `succeeded` one). The request body field is `paymentOutcome`, `succeed` or `fail`; the mock returns exactly that outcome and stores no card data.
- **Options.** A provider sandbox such as Stripe test mode (needs an external account and network on a clean Mac); a random success or failure (cannot be demoed on demand); always succeed (cannot show the failure and late-payment paths).
- **Trade-off.** No card data and no real provider; the port is where a real provider plugs in.
- **Status.** `implemented`: Phase 2 it-5, it-6 (`infrastructure/payment/mock-payment-gateway.ts`, `application/ports/payment-gateway.ts`, `presentation/http/routes/checkout.route.ts`; tests `mock-payment-gateway.test.ts`, `checkout-service.test.ts`, `checkout.route.integration.test.ts`). The known void gap is in D4.

### O9. Seed data

- **Choice.** Deterministic seed: about 12 venues across about 5 countries and 8 cities, 200 shows across types and genres, one event per show over the next 90 days, each with a generated 10 x 20 grid (200 seats). Seeded users `admin@seathold.local` and `buyer@seathold.local`.
- **Options.** One venue as in the brief's minimum (venue, city and country filters would have one value).
- **Trade-off.** 40,000 seat rows on top of the brief's minimum, seeded with batched inserts; the clean-Mac install time is measured in Phase 5. If the seed threatens the 10-minute target, it drops to fewer events with full grids, keeping the venue spread.
- **Status.** `implemented`: Phase 1 it-6 (users), Phase 2 it-1 (catalog). Decided 2026-11-26. The catalog seed is O63. The seed prints `catalog inserted venues=<n> shows=<n> events=<n> seats=<n>` (counts of rows created by that run; all zero on a re-run). The 40,000 seat rows are inserted by one `generate_series` statement per run, not by batches; the clean-Mac install time is still measured in Phase 5.

### O10. Search

- **Choice.** One result row per event. Text matches the show title through a stored generated `tsvector` column on `shows` (`simple` config, GIN) or the venue name through `ILIKE` on the small venues table, with indexed filters on type, genre, country, city, venue and `starts_at`; pagination capped at 50; seats left is one grouped count per result page over the index `seats(event_id, status)`, with no stored counter.
- **Options.** `ILIKE` scans; an external search engine (OpenSearch).
- **Trade-off.** No fuzzy or typo-tolerant matching; no extra service to run.
- **Status.** `implemented`: Phase 3 it-1; the exact rules, limits and the EXPLAIN finding are in O70.

### O11. Live seat status

- **Choice.** Polling every 3 s on the event page (TanStack Query).
- **Options.** Server-Sent Events; WebSocket.
- **Trade-off.** Up to 3 s staleness and more requests; no long-lived connections to manage behind the ALB. Combined with the 1-2 s edge cache at scale (D3).
- **Status.** `implemented`: Phase 3 it-6; the polling rule and its trade-offs are in O77.

### O12. Design system base

- **Choice.** Mantine, themed, with our own component layer; `DateTimeRangePicker` (date and time from-to in one control) and `SeatMap` (SVG) are our own extensions.
- **Options.** MUI (its date-time range picker is in the paid tier); Radix with own styling (more work).
- **Trade-off.** A dependency on Mantine's API; Mantine has a date range and a single date-time picker but no date-time range, so the extension is real work.
- **Status.** `implemented` for Phase 3 it-4 and it-6 (O76, O77); Phase 6 deepens both components and stays `planned`.

### O13. Local environment

- **Choice.** Development, tests and verify run on Docker Compose (PostgreSQL 17, Mailpit). The macOS install skill uses Homebrew services with the same versions and `.env` keys.
- **Options.** Docker on the Mac too; Homebrew everywhere.
- **Trade-off.** Two local setups to keep in line (a review check enforces it); in return the clean-Mac run avoids Docker Desktop's GUI install and fits under 10 minutes.
- **Status.** `planned`: Phase 0 it-3, it-7. In place: `docker-compose.yml` (PostgreSQL 17.12, Mailpit v1.34.0; checked by `docker compose config -q`), `.env.example` (test `backend/src/config/env-example.test.ts`), `README.md` (test `scripts/readme-commands.test.mjs`), `.claude/skills/install-seathold/SKILL.md` (tracked, test `scripts/git-hygiene.test.mjs`). The install skill is rewritten and statically checked (917be0a: its commands are checked against `package.json`). Missing: the timed clean-Mac run has not been done; a person must run it on a Mac, so the Homebrew path is unproven and the install proof stays open.

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
- **Status.** `implemented`: Phase 2 it-1, it-5 (`booking/domain/money.ts`, `events.price_minor` and `currency`, `bookings.unit_price_minor`, `total_minor`, `currency`, `payments.amount_minor`; tests `money.test.ts`, `checkout-service.test.ts`, `prisma-checkout-repository.integration.test.ts`). `DEFAULT_CURRENCY` (three uppercase letters) is used by the catalog seed; the booking copies the event's unit price and the total at confirm.

### O17. Event size cap

- **Choice.** 1-200 rows and 1-200 seats per row, at most 20,000 seats per event, enforced by a `CHECK` and by input validation.
- **Options.** 50 x 50 (2,500 seats, too small for the scale scenario); no cap.
- **Trade-off.** A 20,000-seat event means a 20,000-row insert in one transaction at creation and a heavy SVG seat map (zoom and pan in Phase 6).
- **Status.** `implemented` for the database `CHECK` (`events_grid_check`, Phase 2 it-1; test `catalog-schema.integration.test.ts`); input validation at event creation is `implemented` in Phase 4 it-1 (O86), and row labels beyond 26 rows are defined by `rowLabel` (A to Z, then AA; O85). The earlier note about `chr(64 + row)` is out of date: the seed and the back office both use `rowLabel`.

### O18. Visitor hold on login

- **Choice.** With a session, the holder is the user. On the next booking request after login, each active visitor hold moves to the user, unless the user already has an active hold for that event; then the visitor hold's seats are released. Checkout resolves the holder session first, then visitor.
- **Options.** Keep holds on the visitor (the buyer loses them on login, or buys under the wrong identity); merge seats into the user's existing hold.
- **Trade-off.** In the rare conflicting case the visitor's seats go back on sale; merging was rejected because expiry and seat cap would need extra rules.
- **Status.** `implemented`: Phase 2 it-6 (`application/adopt-visitor-holds-service.ts`, `hooks/holder-hooks.ts`; tests `adopt-visitor-holds-service.test.ts`, `adopt-visitor-holds.integration.test.ts`, `adopt-visitor-holds.route.integration.test.ts`). Details: O60.

### O19. Session lifetime

- **Choice.** Fixed 30-day sessions, no idle timeout.
- **Options.** Short sessions with refresh; a sliding idle timeout.
- **Trade-off.** A stolen cookie stays valid longer; mitigated by `HttpOnly` cookies, logout-all, and an admin idle timeout listed before production.
- **Status.** `implemented`: Phase 1 it-4 (`SESSION_TTL_DAYS`, default 30, in `backend/src/config/load-config.ts`; see O44). The admin idle timeout stays `planned` (Security, before production). Files and tests: `backend/src/modules/auth/application/session-service.ts`, `backend/src/config/load-config.ts` (`SESSION_TTL_DAYS`), tested in `session-service.test.ts` and `auth-session-routes.integration.test.ts` (Phase 1 it-4, O44).

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
- **Status.** `implemented`: `frontend/package.json`, `frontend/src/shared/lib/api-client.ts`, tests `api-client.test.ts`, `bootstrap.test.tsx`, `load-frontend-config.test.ts`, `vite.config.test.ts` (Phase 0 it-5, review fixes). The Phase 1 extension (`post`, the token provider and `X-CSRF-Token`) is `implemented`: see O53.

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

- **Choice.** The plan's it-3 listed `.env.local.example` next to `.env.example`. It was dropped: both workspaces read the single repository-root `.env` (the backend through `--env-file-if-exists=../.env`; the Vite dev server sets `envDir` to the repository root, so `BACKEND_*` for the proxy and `VITE_*` for the client both come from it), and nothing reads `.env.local`. `backend/prisma.config.ts` loads that same file with `process.loadEnvFile` when it exists, and does not replace a `DATABASE_URL` already present in the environment, so CI and the throwaway test database keep the URL they inject. `.env.example` is the template for host and Docker runs; `.env.docker.local.example` stays for the Compose overrides.
- **Options.** Keep a second template nothing loads (a trap: copying it does nothing).
- **Trade-off.** One file serves host and Docker runs, so the host values (`127.0.0.1`) are the example defaults and the image sets its own `BACKEND_HOST`.
- **Status.** `implemented`: `.env.local.example` deleted; `frontend/vite.config.ts` `envDir`, test `frontend/vite.config.test.ts` (Phase 0 review fixes). Prisma CLI: `backend/prisma.config.ts` loads the root `.env`.

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
- **Status.** `implemented` for the nodemailer pair: `backend/package.json`, `package-lock.json`. `@fastify/cookie` landed in it-4 (O45) and `@fastify/csrf-protection` 8.0.2 in it-5 (O46); all approved dependencies are now installed.

### O39. Email provider port, adapters and factory

- **Context.** Auth sends login codes by email. Plan section 2: `console` for tests, `smtp` for Mailpit locally and SES SMTP in production; `console` in production must fail.
- **Choice.** Port `EmailProvider.send({ to, subject, text })` in `backend/src/modules/auth/application/ports/email-provider.ts`; it has no auth-code method (the login-code template belongs to the login service, it-3). `SmtpEmailProvider` takes an injected transporter and sends from `EMAIL_FROM`; a transport failure becomes `InfrastructureError("Email delivery failed (<CODE>)")`, with only a short upper-case error code (for example `EAUTH`) and no cause, because the nodemailer error can quote credentials or the message. `ConsoleEmailProvider` writes the whole message, body included, to an injected writer; it exists so tests can read the code, and the factory never builds it in production. `createEmailProvider(config, deps)` picks by `EMAIL_PROVIDER` and throws for `console` when `APP_ENV=production`; `loadConfig` refuses the same combination first (defense in depth, each tested). Config: `EMAIL_PROVIDER` (`console`|`smtp`, default `smtp`), `EMAIL_FROM` (default `no-reply@seathold.local`, must look like an address), `SMTP_HOST` (`localhost`), `SMTP_PORT` (1-65535, `1025`), `SMTP_USER` and `SMTP_PASS` (optional, set together; the missing half is named). `SMTP_PASS` is a secret: not in `.env.example`, production injects it. `SMTP_USER` is also left out of the example because local Mailpit needs no login. `env-example.test.ts` lists both as intentionally undocumented, and asserts `SMTP_PASS` never appears in the example.
- **Options.** Default `console` locally (hides misconfiguration; Mailpit is the local default per the plan); keep the transport error as `cause` (leaks risk); an extra production rule on `SMTP_HOST` (kept simple, no rule beyond console refusal and the credential pair); a native SES API adapter (not now, the port allows it later).
- **Trade-off.** Dropping the cause loses the original SMTP diagnostic; the error code is the only detail kept. Wired in `runtime.ts` through `createEmailProvider` (test `runtime.test.ts`).
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
- **Choice.** *Format and hash.* A code is six digits from `crypto.randomInt(1_000_000)`, zero-padded (`RandomLoginCodeGenerator`). Stored value: HMAC-SHA256 of the code keyed with the pepper, hex (`HmacLoginCodeHasher`); the plaintext exists only in the email body and never reaches the repository, logs or results. Comparison goes through `safeEqualHex` (`crypto.timingSafeEqual`, different lengths are simply unequal). *Expiry.* Ten minutes after the single `Clock.now()` read, a fixed domain constant (`LOGIN_CODE_TTL_MINUTES`), not configuration; `findLatestValid` and `consume` compare against the same `now`. *Request limit.* Counted from `auth_codes` (so it holds across instances): at least `AUTH_REQUEST_CODE_LIMIT` codes created for the email in the last `AUTH_REQUEST_CODE_WINDOW_MINUTES` blocks the next one (the 6th with the default), and so does a latest request younger than `AUTH_REQUEST_CODE_COOLDOWN_SECONDS`. The result is a value, `{ kind: "rate_limited", retryAfterSeconds }`, the larger of the two waits, rounded up, at least 1; the window wait is when the oldest request in the window leaves it, read through the new port method `oldestCreatedAtSince`. A request that passes invalidates earlier unused codes, stores the new hash, and sends the email (template in `login-code-email.ts`). *Enumeration.* The request service never reads users: a known and an unknown address take the same path and get the same result, including the same rate-limited answer. *Verify.* Latest valid code for the email; none, or 5 attempts used, or a wrong code, or a lost consume race all give the one result `invalid_code`. A wrong code adds an attempt, and the fifth kills the code even for the right value. A right code is consumed by the conditional update (O41), then the user is found or created as `buyer`; no role comes from input. Sessions are Phase 1 it-4. *Delivery failure.* An `InfrastructureError` from the provider propagates; any other provider error becomes a new `InfrastructureError` without message or cause, so a body containing the code cannot leak. The code row stays, so a failed send still counts toward the limit. The review of Phase 1 raised two points, consuming the code before the session is created and persisting the code before sending it, and both were kept: consuming first prevents two sessions from one code, and a code that was never received is unusable by an attacker who cannot read the email.
- **Options.** Hash bound to the email as well as the pepper (more complex, little gain against a keyed hash); throwing for rate limit (the HTTP layer needs `retryAfterSeconds`, a result is simpler); a retry-after from `latest + window` (no new port method, but overstates the wait by minutes); deleting the row when sending fails (an extra write, and it would let a broken mailer bypass the limit).
- **Trade-off.** Concurrent requests can pass the count check together and exceed the limit by the number of racers; the cooldown and WAF rate rules at the edge bound this, and an exact limit would need a lock or advisory lock per email (not now). Concurrent wrong guesses can overshoot 5 attempts by the same few. Codes live in a 10^6 space: the 5-attempt cap, the 10-minute life and the request limit are the defence. The earlier-code invalidation and the new row are separate statements; a crash between them leaves no valid code, and the user requests again.
- **Status.** `implemented`: `backend/src/modules/auth/application/{request-login-code-service,verify-login-code-service,login-code-email}.ts`, `application/ports/{login-code-generator,login-code-hasher,login-code-repository}.ts`, `infrastructure/crypto/*`, `domain/{email,login-code}.ts`, `infrastructure/persistence/prisma-login-code-repository.ts`; tests `request-login-code-service.test.ts`, `verify-login-code-service.test.ts`, `login-code-lifecycle.integration.test.ts`, `timing-safe.test.ts`, `hmac-login-code-hasher.test.ts`, `random-login-code-generator.test.ts`, `email.test.ts`, `prisma-login-code-repository.integration.test.ts`. The in-memory fakes are `application/in-memory-auth-test-support.ts` (excluded from the build).

### O44. Sessions, the `sid` cookie and the /api/auth routes

- **Context.** Plan sections 2, 3, 6 (flows 3 and 5), 8, Phase 1 it-4.
- **Choice.** *Token.* `CryptoSessionTokens`: 32 bytes from `crypto.randomBytes`, base64url in the cookie; the stored value is its SHA-256 hex (`sessions.token_hash`, unique). A token is high-entropy, so no pepper or slow hash. *Lifetime.* `SessionService.create` sets `expires_at = Clock.now() + SESSION_TTL_DAYS` (config, positive integer, default 30) from one clock read; `authenticate`, `revoke` and `revokeAll` read the clock once each. *Authenticate.* Returns the `ActiveSession` (session id, expiry, user), not the bare user, because logout needs the session id; the user and its role come from the repository join on every request, so a promotion or demotion applies on the next request. *Rotation.* `LoginService` (verify code, then session) always creates a new session and never reuses a presented sid; a live presented sid is revoked after the code verifies; a wrong code leaves it alone. *Cookie.* `sid`, `HttpOnly`, `SameSite=Lax`, `Path=/api`, `Max-Age` = the session lifetime, `Secure` when `COOKIE_SECURE=true`; logout clears it with the same attributes. `COOKIE_SECURE` defaults to false locally and `loadConfig` requires it to be exactly `true` when `APP_ENV=production` (the error names the variable only); the CI image smoke runs with `APP_ENV=local`, so it needs no value. *Hooks.* `requireAuth` and `optionalAuth` (`modules/auth/presentation/http/hooks/require-auth.ts`) read the cookie through `@fastify/cookie`, authenticate through `SessionService` and set the typed request decorations `user` and `sessionId`; a missing, unknown, revoked or expired session is 401 `UNAUTHENTICATED`. *Error codes.* `AppError` gains an optional `publicCode`; the shared error handler sends it instead of the generic code of the kind, so `UNAUTHENTICATED` and `INVALID_CODE` go through the one error contract. `RATE_LIMITED` carries an extra `retryAfterSeconds` field and a `Retry-After` header, so that route builds that body itself. *Routes.* One file per route in `presentation/http/routes/` (`request-code`, `verify`, `me`, `logout`, `logout-all`), each calling one application service; bodies have JSON schemas with `additionalProperties: false`. Fastify's default Ajv removes unknown properties instead of failing, so a `role` field is dropped silently and no role can come from input (test: `auth-login-routes.integration.test.ts`). *Wiring.* `authPlugin` is registered from `app.ts` under `/api` when `AppDeps.auth` is given; `runtime.ts` composes it through `createAuthServices` and `createPrismaAuthRepositories` (`auth-composition.ts`). `auth` is optional in `AppDeps` so the app tests that need only the health route stay free of fakes. *Seam.* Every route module receives `mutationHooks`, run first on each state-changing route. It was empty in it-4; it-5 fills it (O48).
- **Options.** Returning only the user from `authenticate` (logout would need a second lookup); a role claim in the session (stale after a demotion); a signed cookie (the stored hash already makes the token unforgeable); making `auth` required in `AppDeps` (every app test would need fakes); a separate error class per code (more classes for one string).
- **Trade-off.** *Closed by it-5 (O48):* the unprotected-mutation window of it-4 (the state-changing auth routes `request-code`, `verify`, `logout`, `logout-all` had no CSRF or Origin check) no longer exists; all four are covered by test. A login with `SameSite=Lax` still protects other cookie-authenticated mutations from cross-site POSTs only partly (it-5 adds the token). The fixed lifetime has no idle timeout (O19). Revoking a presented session on login is a second write after the code is consumed; a crash between them leaves the old session alive until it expires.
- **Status.** `implemented`: `backend/src/modules/auth/application/{session-service,login-service}.ts`, `application/ports/session-tokens.ts`, `infrastructure/crypto/crypto-session-tokens.ts`, `auth-composition.ts`, `presentation/http/{auth-plugin,auth-route-options,auth-dto,session-cookie}.ts`, `presentation/http/hooks/require-auth.ts`, `presentation/http/routes/*.route.ts`, `backend/src/config/load-config.ts`, `backend/src/shared/errors/app-error.ts`, `presentation/http/hooks/error-handler.ts`, `backend/src/{app,runtime}.ts`, `.env.example`; tests `session-service.test.ts`, `login-service.test.ts`, `crypto-session-tokens.test.ts`, `load-config-session.test.ts`, `error-handler.test.ts`, `auth-login-routes.integration.test.ts`, `auth-session-routes.integration.test.ts`, `log-redaction.test.ts`, `runtime.test.ts`. The in-memory session repository is in `application/in-memory-auth-test-support.ts`.

### O45. Dependency: `@fastify/cookie`

- **Context.** The `sid` cookie must be parsed and set with the right attributes (rule 40: no custom cookie handling).
- **Choice.** `@fastify/cookie` 11.1.5 (latest stable at install time, Fastify 5 compatible), exact pin in `backend/package.json`. Used for parsing and for `setCookie` and `clearCookie`; cookie signing is not used (O44).
- **Options.** Hand-written `Set-Cookie` and header parsing (easy to get an attribute or an escape wrong).
- **Trade-off.** One more dependency (it brings `cookie` and `fastify-plugin`); `@fastify/csrf-protection` in it-5 builds on the same plugin.
- **Status.** `implemented`: `backend/package.json`, `package-lock.json`, `modules/auth/presentation/http/auth-plugin.ts`.

### O46. CSRF: double submit with a signed secret cookie

- **Context.** Plan sections 2 and 3: every state-changing browser request passes a CSRF check (rule 42); no custom CSRF scheme (rule 40).
- **Choice.** `@fastify/csrf-protection` 8.0.2 (latest stable at install time, Fastify 5 compatible), exact pin in `backend/package.json`; it brings `@fastify/csrf` and `@fastify/error`. Mechanism: double submit with `sessionPlugin: "@fastify/cookie"`. `GET /api/auth/csrf` calls `reply.generateCsrf()`, which creates a random secret, stores it in the cookie `csrf_secret` (signed with `CSRF_SECRET` through `@fastify/cookie`'s `secret`, `HttpOnly`, `SameSite=Lax`, `Path=/api`, `Secure` per `COOKIE_SECURE`, a session cookie with no `Max-Age`) and returns `{ "csrfToken" }` derived from it, with `Cache-Control: no-store`. A browser that already holds the cookie keeps its secret; the endpoint only issues a new token. Mutations send the token in `X-CSRF-Token` and the browser sends the cookie; the library verifies the token against the unsigned secret. The token is read from that header only (the library default also reads the body and other header names; `getToken` narrows it). The cookie name differs from `sid`. `registerCsrfProtection` (`presentation/http/csrf-protection.ts`) registers `@fastify/cookie` (now with the secret, moved out of `authPlugin`) and the plugin once on the root app, because the cookie parser must exist for the `sid` cookie too. *Config.* `CSRF_SECRET`: secret, required in every environment, at least 32 characters, the error names the variable only; production refuses the local placeholder `localCsrfSecretPlaceholder` (as `AUTH_CODE_PEPPER` does, O42); `.env.example` carries that placeholder with the same comment; `.env.manager` and `scripts/image-smoke.mjs` carry throwaway test values. *Failure.* The library answers through `reply.send(error)`; `csrfHook` hands it a reply stub that rejects, so the failure becomes `AuthorizationError` with `publicCode: "CSRF_INVALID"` and leaves as 403 `{ error: { code: "CSRF_INVALID", message } }` through the one error handler (O34, O44), without the library's text. Missing cookie, unsigned or foreign-signed cookie, missing and wrong token are the same answer.
- **Options.** Synchronizer token stored per session in the database (needs a row per anonymous browser before login); a hand-written double submit (rule 40 forbids it); the library with `@fastify/session` (a second session system next to `sid`); an unsigned secret cookie (an attacker who can set cookies on a sibling subdomain could pair their own secret and token).
- **Trade-off.** The secret and token are not bound to the user, so login does not rotate them: the library's per-user binding (`getUserInfo`) needs an HMAC key and a session lookup in the CSRF check, and the session cookie is `SameSite=Lax` already. A token stays valid while its cookie lives (the browser session). Rotating `CSRF_SECRET` invalidates every browser's cookie; the frontend fetches a fresh token (a 403 `CSRF_INVALID` makes the client refetch it, Phase 1 it-7).
- **Status.** `implemented`: `backend/package.json`, `package-lock.json`, `backend/src/presentation/http/csrf-protection.ts`, `presentation/http/hooks/browser-state-change-hooks.ts`, `modules/auth/presentation/http/routes/csrf.route.ts`, `config/load-config.ts`, `.env.example`, `scripts/image-smoke.mjs`; tests `load-config-csrf.test.ts`, `env-example.test.ts`, `browser-state-change-hooks.test.ts`, `auth-csrf-routes.test.ts`, `log-redaction.test.ts` (no token, CSRF cookie or secret in logs), `image-smoke.test.mjs`.

### O47. Origin check on mutations

- **Context.** Plan section 2: Origin must equal `FRONTEND_ORIGIN` on mutations; rule 42 asks to validate the allowed browser Origin.
- **Choice.** `originHook` (first in `browserStateChangeHooks`) compares the `Origin` header to `config.frontendOrigin` by exact string equality. A different origin, a trailing slash, another scheme or port, `null`, an empty value and a missing header are all 403 `ORIGIN_INVALID`. There is no fallback to `Referer`. The Origin check runs before the CSRF check, so a foreign page learns nothing about token validity. Browsers send `Origin` on every cross-origin and every same-origin non-GET fetch, so the strict rule costs the SPA nothing; non-browser clients must send it.
- **Options.** Allow a missing Origin (curl-friendly, but removes the check for any client that omits it); fall back to `Referer` (can be stripped by policy, adds a second parser); a list of origins (only one frontend exists; `FRONTEND_ORIGIN` is the single explicit entry, rule 40).
- **Trade-off.** Scripts and tests that call the API must set the header; a future second frontend origin needs a config change.
- **Status.** `implemented`: `presentation/http/hooks/browser-state-change-hooks.ts`; tests `browser-state-change-hooks.test.ts`, `auth-csrf-routes.test.ts`, `mutating-routes-guard.test.ts`.

### O48. Filling the mutation-hook seam

- **Context.** O44 left `mutationHooks` empty in every auth route module; rules 80 and 81 want the shared check composed, not reimplemented, and not registered globally.
- **Choice.** `browserStateChangeHooks(config)` returns `[originHook, csrfHook]` and is called once in `buildApp` (composition), which passes it to `authPlugin`; each mutating route puts it first in its `onRequest` list (before `requireAuth`, so a forged request is refused as 403 before any session lookup). The seam is hard to forget: `AuthPluginOptions.mutationHooks` and `AuthRouteOptions.mutationHooks` are required and typed as a non-empty list (`BrowserStateChangeHooks`), and `AppDeps.auth` no longer carries the hooks, so a caller cannot pass an empty or missing one. A test collects every route the real app registers (`onRoute`) and asserts that each method other than GET, HEAD and OPTIONS answers 403 `CSRF_INVALID` without a token and 403 `ORIGIN_INVALID` for a foreign Origin, so a future mutating route that omits the hooks fails the build. `GET` routes (`me`, `csrf`, `health`) carry no check. Integration tests send valid credentials through a harness helper (`post` fetches a token, adds its cookie and the Origin; `postBare` sends nothing).
- **Options.** A global `onRequest` hook for all non-GET methods (rule 80: global hooks are for credential separation only, and a public webhook-style route would need an opt-out); leaving each route to remember the list (the failure this iteration closes).
- **Trade-off.** The list still has to be written into each route's options; the type and the enumeration test make a missing one a failure, not a silent hole. A route registered outside `buildApp` is not covered by the enumeration.
- **Status.** `implemented`: `app.ts`, `modules/auth/presentation/http/{auth-plugin,auth-route-options}.ts`, `routes/*.route.ts`; tests `mutating-routes-guard.test.ts`, `auth-csrf-routes.test.ts`, `auth-session-routes.integration.test.ts`, `runtime.test.ts`.

### O49. The admin boundary: one plugin, `requireRole`, role read per request

- **Context.** Plan Phase 1 section 2 puts everything under `/api/admin/*` behind one check, and a demoted admin must lose access at once.
- **Choice.** `requireRole(role)` (`modules/auth/presentation/http/hooks/require-role.ts`) runs after `requireAuth` and compares `request.user.role`, which `requireAuth` read from the database for this request (the session holds the user id only, O44): demotion applies on the next request, no cache. A mismatch is 403 `FORBIDDEN_ROLE` (`AuthorizationError` with `publicCode`); with no user on the request it fails closed with 401 `UNAUTHENTICATED`. `adminPlugin` (`presentation/http/admin-plugin.ts`), registered by `buildApp` at `/api/admin`, adds scope hooks in this order: the browser-state-change hooks (Origin, CSRF) for methods other than GET, HEAD and OPTIONS, then `requireAuth`, then `requireRole('admin')`; it takes the route modules as a list (`routes`), so a later module adds a route inside the guarded scope and cannot forget a check. The placeholder `GET /api/admin/ping` was removed in Phase 4 (O95); the list now holds the six back-office routes (O87). A route test enumerates every route the real app registers under `/api/admin` (`onRoute`), asserts the exact list, and requires anonymous 401, buyer 403 `FORBIDDEN_ROLE`, admin 2xx for each (O87), so an admin route registered outside the plugin fails the build; a test registers such a stray route and shows the check reports it.
- **Options.** `requireRole` in each route (forgettable); a global hook on the `/api/admin` prefix (rule 80 keeps global hooks for credential separation); caching the role in the session (a demotion would wait for the session to end).
- **Trade-off.** One extra database read per admin request (the session lookup already joins the user, so no second query). Mutation hooks run before the session lookup, as in O48, so an anonymous POST without a token is answered 403 `CSRF_INVALID`, not 401. The enumeration covers routes registered through `buildApp` only.
- **Status.** `implemented`: `require-role.ts`, `admin-plugin.ts`, `routes/admin-ping.route.ts` (removed in Phase 4, O95), `app.ts`; tests `require-role.test.ts`, `admin-plugin.test.ts`, `admin-access.integration.test.ts` (route-wide 401/403/2xx, demotion and promotion on the next request with the same session, stray route detected, no route path names a role; verify with a role in the body still creates a buyer: `admin-access.integration.test.ts` and `auth-login-routes.integration.test.ts`).

### O50. Promote and demote scripts

- **Context.** No HTTP path may create or change a role (plan Phase 1 section 2); admins are made by an operator.
- **Choice.** `npm run user:promote -- <email>` and `npm run user:demote -- <email>` (root forwarders to the backend scripts, run with `tsx`, no new dependency). `ChangeUserRoleService` (auth application layer) looks the user up with `findByEmail` first, because `setRoleByEmail` returns false both for an unknown email and for a role already set (O41): unknown email -> message and exit 1 (the person must sign in once; no user is created); role already set -> success, message "already admin" or "already buyer", exit 0; otherwise "is now admin". A missing, extra or malformed email argument prints the usage and exits 1. Logic sits in small functions with injected ports (`scripts/role-command.ts`); the three `main` files only compose config, `PrismaService` and `PrismaUserRepository`. Output is an email and a role only. A startup failure prints what `run` prints (`describeFailure`, now exported), never a connection string. Roles never travel over HTTP: no route path names a role, and verify creates a buyer whatever the body says.
- **Options.** SQL in a script (rejected: the repository exists); an admin API (rejected: privilege escalation surface); an admin-by-email environment variable (rejected: a second source of truth).
- **Trade-off.** Promotion requires a prior sign-in, one extra step on a fresh system (the seed covers local use). The read and the write are not one statement: a concurrent role change between them makes the write a no-op and the result still says "changed"; acceptable for a manual operator command. Sessions of a demoted user stay valid but lose admin rights at the next request (O49).
- **Status.** `implemented`: `modules/auth/application/change-user-role-service.ts`, `scripts/{role-command,user-promote,user-demote,script-runtime,command-io}.ts`, `package.json` scripts, README; tests `change-user-role-service.test.ts`, `role-command.test.ts`, `script-runtime.test.ts`, `role-commands.integration.test.ts`.

### O51. Seed and the seeded accounts

- **Context.** Local development needs an admin and a buyer without sending a login code first.
- **Choice.** `npm run db:seed` (backend `seed`) creates `admin@seathold.local` (admin) and `buyer@seathold.local` (buyer) only when missing. An account that exists is left as it is: a seeded buyer someone promoted stays admin, an admin someone demoted stays buyer, and re-running changes nothing. The seed refuses to run with `APP_ENV=production` (exit 1, nothing written), because the admin has a well-known email (the catalog alone loads in production through `seed:catalog`, O69); check is in `runSeedCommand` and tested. The Phase 0 placeholder `backend/prisma/seed.ts` and the Prisma `migrations.seed` entry are removed: one seed, not two. Login still needs a code (console email provider locally); the seed creates rows, not sessions.
- **Options.** `prisma db seed` with a script under `prisma/` (rejected: duplicates the composition); upsert that forces roles (rejected: would undo `user:demote`); environment-selected seed emails (rejected: YAGNI).
- **Trade-off.** Creating the admin is two statements (create as buyer, then set the role): a crash between them leaves `admin@seathold.local` as a buyer that a rerun does not fix; `npm run user:promote -- admin@seathold.local` repairs it. A repository method that inserts with a role would close the window; not worth a port change for a local seed.
- **Status.** `implemented`: `modules/auth/application/seed-users-service.ts`, `scripts/{seed-command,seed}.ts`, `backend/package.json`, `backend/prisma.config.ts`; tests `seed-users-service.test.ts`, `seed-command.test.ts` (production refusal), `role-commands.integration.test.ts` (idempotent, role changes kept).

### O52. Frontend auth state: `me` as server state

- **Context.** Plan Phase 1 section 4 and it-7: the SPA must know who is signed in without keeping credentials in the browser (rules 30, 31, 40).
- **Choice.** The signed-in user is TanStack Query server state under the key `['auth', 'me']`, filled by `AuthApi.getMe()` (`GET /api/auth/me`); `null` means anonymous, `undefined` means still loading, an error means the check failed (the guards show an alert and do not guess). `useMe` sets `retry: false` and `staleTime: 60s`. A successful verify sets the key to the returned user and a logout sets it to `null` (`useAuthSession`), after cancelling any `me` fetch in flight so a late anonymous answer cannot overwrite the new state. Nothing is written to `localStorage` or `sessionStorage`: the session itself is the `HttpOnly` `sid` cookie, which scripts cannot read. `LoginPage` shows email then a 6-digit code (`autocomplete="email"` and `"one-time-code"`, numeric input mode, submit on Enter, errors in `role="alert"`), and a signed-in user visiting it is redirected on, which is also how it lands after a successful verify. Logout calls `POST /api/auth/logout`, then sets `me` to `null` and goes home; a 401 (session already gone) counts as logged out, any other failure keeps the state and shows an alert. Feature services are `AuthApi` (auth) and `AdminApi` (in Phase 1 the `/admin` placeholder page read `/api/admin/ping`; that route is removed, O95, and `AdminApi` now calls the back-office routes, O103 to O109); components get them through the one `ApiClient` in `ApiClientProvider`.
- **Options.** A React context or global store for the user (a second source of truth next to the query cache; rule 30 prefers the project's server-state mechanism); caching the user in web storage (readable by any script on the origin, goes stale after a demotion); redirecting with an explicit `navigate` after verify (a second path next to the signed-in redirect).
- **Trade-off.** One `me` request on first render of any page that shows the header. After a logout the other cached queries stay in memory until reload; the admin lists (events, lookups, open and bought tickets, `frontend/src/features/admin/hooks/use-admin-queries.ts`) and the booking queries stay in the query cache, and logout does not clear them, so each feature that holds user data must clear its own keys on logout (not done for the admin lists; the server answers 401 or 403 to a signed-out request, and the admin pages sit behind `RequireAdmin`). A role change on the server shows up in the UI when `me` is next fetched; the server enforces it on every request regardless.
- **Status.** `implemented`: `frontend/src/features/auth/{hooks/use-me,use-auth-session,use-login-flow,use-auth-api}.ts`, `services/auth-api.ts`, `components/{login-page,user-menu,require-auth,require-admin,not-allowed-page}.tsx`, `features/admin/*`, `app/router.tsx`, `features/home/home-page.tsx`; tests `login-page.test.tsx`, `user-menu.test.tsx`, `guards.test.tsx`, `auth-api.test.ts` (including no web storage writes).

### O53. CSRF token handling in the ApiClient

- **Context.** Plan section 2 and rule 42: every mutation sends `X-CSRF-Token`; the backend (O46) answers 403 `CSRF_INVALID` otherwise.
- **Choice.** `ApiClient.post` is the only mutation method and goes through the one private `send`, which sets `X-CSRF-Token` for every non-GET request, so a mutation without the header cannot be written. The token comes from `GET /api/auth/csrf` and is cached in the client instance's memory as a promise (parallel first mutations share one fetch; a failed fetch is not cached). It is never stored in web storage, logged, or put in an error. On a 403 with code `CSRF_INVALID` the cache is dropped, the token is fetched again and the request is sent once more; a second failure throws the `ApiError`, so there is no loop. Other 403 answers and every other status are not retried. A mutation is never sent when the token fetch fails or returns no string. `Origin` is added by the browser. Error codes are read from `error.code` (the backend shape); the earlier `body.code` read was wrong and has a regression test. `ApiError` also carries `retryAfterSeconds` from a 429 body, which `AuthApi.requestCode` turns into `{ kind: 'rate_limited' }`.
- **Options.** Reading the token from a cookie in script (the secret cookie is `HttpOnly`, and the token is a derived value from the endpoint); a token fetch before each mutation (an extra round trip every time); an automatic retry on every 403 (would repeat forbidden requests); a retry loop (hammers the API when the cookie is blocked).
- **Trade-off.** Two requests for the first mutation of a page load, and one more after the backend rotates its secret. A page reload drops the token and fetches a new one. Two browser tabs each hold their own token, both valid while the secret cookie lives.
- **Status.** `implemented`: `frontend/src/shared/lib/api-client.ts`, `features/auth/services/auth-api.ts`; tests `api-client-post.test.ts` (header, credentials, JSON body, cache, single retry, no loop, no retry for other 403, no send when the token fetch fails, no storage), `api-client.test.ts` (error code from `error.code`), `auth-api.test.ts`.

### O54. Validated return path after login

- **Context.** The login page returns the user to the page they came from; an unvalidated target is an open redirect.
- **Choice.** The guards put `pathname + search + hash` in router state (`location.state.from`); `LoginPage` passes it through `safeRedirectPath`, which accepts a string that starts with exactly one `/`, has no backslash or control character, and is not `/login` itself (a loop). Everything else (`//host`, `https://host`, `/\host`, `javascript:`, non-strings) becomes `/`. The value is router state, not a query parameter, so a crafted link cannot carry it from outside.
- **Options.** A `?next=` query parameter (attackable from a link, needs the same validation); resolving with `new URL` against the origin (more code for the same result).
- **Trade-off.** A reload of the login page loses the state and lands on `/`. A legitimate path containing a backslash is refused.
- **Status.** `implemented`: `frontend/src/features/auth/lib/safe-redirect.ts`; tests `safe-redirect.test.ts`, `login-page.test.tsx` (malicious `from` values).

### O55. Route guards are UX only

- **Context.** Plan section 3: authorization is enforced on the server.
- **Choice.** `RequireAuth` sends an anonymous visitor to `/login`; `RequireAdmin` (built on it) shows a "Not allowed" page to a buyer and renders its children for an admin. They save a buyer from a page that would only fail and are not a security control: `/api/admin/*` answers 401 and 403 by itself (O49), and the page code for the back office ships to every visitor, so it holds no secrets. A buyer who bypasses the guard in the browser still gets 403 from every admin call.
- **Options.** Treating the guard as the control (wrong: the client is untrusted); lazy-loading admin code only for admins (a bundle-size choice for Phase 4, not a security one).
- **Trade-off.** The role shown to the guard comes from `me` and can be up to 60 seconds stale in the UI.
- **Status.** `implemented`: `frontend/src/features/auth/components/{require-auth,require-admin,not-allowed-page}.tsx`, `app/router.tsx`; tests `guards.test.tsx`.

### O56. Phase 1 security summary and what remains before production

- **Context.** Phase 1 (auth and access) is built; the brief asks for a security review of the whole. This entry gathers the controls and the open risks; the detail is in the linked entries.
- **Choice.** *Implemented controls.* Passwordless email codes: six random digits, HMAC-SHA256 with a pepper, 10 minutes, 5 attempts, single use, database-backed request limit and cooldown, no account enumeration (O42, O43). Email transport `console` or `smtp`, `console` refused in production (O39). Schema with case-insensitive unique emails, role CHECK, hashed session tokens, cascade delete, conditional updates (O40, O41). Server-side sessions in the `sid` cookie, hash stored, rotated on login, revoked on logout (O19, O44, O45). CSRF double submit with a signed secret cookie, plus the Origin check, composed on every mutating browser route (O46, O47, O48). `/api/admin/*` as one plugin that requires a session and the admin role, role read per request (O49). Roles changed only by seed and CLI (O50, O51). Frontend guards as UX only (O52 to O55). Log redaction of cookies, CSRF header and bodies (O25). Production refuses the local secret placeholders, `console` email and an insecure cookie (O22, O42, O46). Every row of the Phase 1 "Agreed decisions" table has an entry above (login, code limit and enumeration O43; sign-up O43; admin grant O50, O51; session O19, O44; role freshness O49; CSRF O46, O47; back-office boundary O49; expiry time O4, O43; email transport O39; seeded users O51; secrets and variables O42, O46).
- **Before production (written, not built).** AWS WAF rate rules at the edge; an idle timeout for admin sessions; a general admin audit log (only the manual seat release is logged, O98); a fresh login code before destructive admin actions; a purge job for old `auth_codes` (rows older than a day, in bounded batches, with an index on `created_at`); SMTP credentials (`SMTP_USER`, `SMTP_PASS`) from the secret store and the SES SMTP wiring, none of it exercised yet.
- **Open risks recorded during the iterations.** The request limit and the attempt count can overshoot by the number of concurrent racers (O43); the CSRF secret and token are not bound to the user and are not rotated on login (O46); creating the seeded admin is two statements and a crash between them leaves a buyer that `npm run user:promote` repairs (O51); the runtime image has no migration path, so a deployed instance cannot apply migrations until the one-off task of O35 exists (O35 stays `planned`).
- **Options.** Leave the summary to the Security table only (it lists controls but not the open risks and cross-links); one entry per risk (the risks already sit in their own entries).
- **Trade-off.** A summary can drift from the entries it links; the linked entries are the source, and this one changes in the same commit as any of them.
- **Status.** `implemented` as documentation in Phase 1 it-8: this entry, the Security section above and `README.md`, "Authentication". The controls are proven by the tests named in the linked entries; the login flow has not been exercised in a real browser against a real backend, and CI has not run on GitHub.

### O57. Checkout route and strict request bodies

- **Context.** Phase 2 it-6: `POST /api/events/:eventId/hold/checkout` pays for the caller's hold. Fastify's default Ajv strips unknown body fields (`removeAdditional: true`), so `additionalProperties: false` alone would not reject them, and the auth routes rely on that stripping.
- **Choice.** The route composes the shared CSRF and Origin hooks, then `identity.resolve` (adopts a visitor's holds when a session and a `vid` cookie arrive together; never issues a cookie). Body `{ paymentOutcome, guestEmail? }` with `additionalProperties: false` and `guestEmail` at most 254 characters; the email's syntax stays a domain rule (400 `GUEST_EMAIL_INVALID`). No holder gives 404 `HOLD_NOT_FOUND`. Success is 201 with the booking and its tickets; every response is `Cache-Control: no-store`. Request bodies are never logged (O25). The schema adds `propertyNames: { enum: [...] }`, which rejects an unknown field with 400 without changing the app-wide Ajv behaviour.
- **Options.** Per-route stripping tolerated (unknown fields silently ignored: hides client bugs); Ajv `removeAdditional: false` app-wide (breaks the auth tests that prove an extra `role` field is ignored); a custom per-route check (duplicates the schema).
- **Trade-off.** Strict only on this route; other bodies still strip unknown fields.
- **Status.** `implemented`: `modules/booking/presentation/http/{booking-dto.ts,routes/checkout.route.ts}`; tests `checkout.route.integration.test.ts`, `mutating-routes-guard.test.ts`.

### O58. Error kinds `not_found` (404) and `payment_required` (402)

- **Context.** Phase 2 needs 404 for a missing or foreign hold or event and 402 for a declined payment. O34 had only 400, 401, 403 and 409 business kinds.
- **Choice.** `NotFoundError` (kind `not_found`, HTTP 404, default code `not_found`) and `PaymentRequiredError` (kind `payment_required`, HTTP 402, default code `payment_required`) in `backend/src/shared/errors/app-error.ts`, mapped in the shared error handler (`presentation/http/hooks/error-handler.ts`). Booking errors extend them and carry a stable `publicCode`: `HOLD_NOT_FOUND`, `EVENT_NOT_FOUND` (404), `PAYMENT_FAILED` (402). Business rules stay 409 `BusinessError` with `SEAT_UNAVAILABLE`, `HOLD_EXPIRED`, `HOLD_LIMIT_REACHED`; `GUEST_EMAIL_INVALID` is a 400 `ValidationError`.
- **Options.** Reuse `BusinessError` (409) for everything (a missing hold would look like a state conflict); decide the status in each route (duplicates the mapping and leaks HTTP into the domain's intent).
- **Trade-off.** Two more kinds to keep in the handler's table. Another holder's hold answers 404, the same as a missing one, so a hold id or holder cannot be probed.
- **Status.** `implemented`: Phase 2 it-2, it-6; tests `booking/domain/errors.test.ts`, `presentation/http/hooks/error-handler.test.ts`.

### O59. Visitor identity: the `vid` cookie

- **Context.** An anonymous visitor must hold seats and check out as a guest without an account.
- **Choice.** A random 32-byte token (Node `crypto.randomBytes`, base64url, 43 characters) in the cookie `vid`: `HttpOnly`, `SameSite=Lax`, `Path=/api`, `Secure` when `COOKIE_SECURE=true`, max age 30 days. Only the SHA-256 hex of the token is stored (`holds.visitor_hash`); a fast hash is enough for a random 256-bit value. A cookie whose value is not 43 base64url characters is ignored. The cookie is issued only by the hold route (`issueHolder`) to a browser with neither session nor valid cookie; read routes, release and checkout never issue one. The user wins: when a session exists the holder is the user, whatever the cookie says; the `vid` cookie is cleared once adopted (O60). `request.holder` is set by shared hooks in `booking/presentation/http/hooks/holder-hooks.ts`, composed by the routes.
- **Options.** A server-side visitor row with a session id (more state for a throwaway identity); a signed cookie (a secret to rotate, no gain over a random token); no anonymous holds (forces sign-in before the first click).
- **Trade-off.** The token is bearer: anyone holding the cookie holds the visitor's seats until expiry; a cleared cookie loses the hold (it expires on its own). 30 days is far longer than a hold; the cookie only needs to outlive it.
- **Status.** `implemented`: Phase 2 it-6; tests `hooks/holder-hooks.test.ts`, `hold-seat.route.integration.test.ts`, `current-hold.route.integration.test.ts`.

### O60. Adopting visitor holds on login

- **Context.** O18 chose to move a visitor's holds to the user. The mechanism needed a decision.
- **Choice.** The identity hooks run `AdoptVisitorHoldsService.adopt` on any booking request that carries both a session and a valid `vid` cookie (hold, release, current hold, checkout; not the public seat map). One transaction, one clock read: for each active visitor hold (locked `FOR UPDATE`), expire a stale hold of either side, then `adoptHold` (set `user_id`, clear `visitor_hash`, only if the user has no active hold for that event). The update runs inside a `SAVEPOINT`: a user hold created concurrently violates the partial unique index, the savepoint rolls back and the visitor hold is released instead (its seats freed). The reply then clears the `vid` cookie, also when there was nothing to adopt.
- **Options.** A dedicated login hook (couples the auth module to booking); adopting only at login (misses holds made after login in another tab); no savepoint (a unique violation aborts the whole transaction).
- **Trade-off.** An extra transaction on every booking request that still carries a stale cookie until the first reply clears it. A hold held by two tabs is adopted by whichever request arrives first.
- **Status.** `implemented`: Phase 2 it-6; tests `adopt-visitor-holds-service.test.ts`, `adopt-visitor-holds.integration.test.ts` (including the concurrent-creation fallback), `adopt-visitor-holds.route.integration.test.ts`.

### O61. Public seat map and per-viewer hold route

- **Context.** D3 splits the seat API so the map can be cached while each viewer's hold stays private.
- **Choice.** `GET /api/events/:eventId/seats` reads no cookie, sets none, and answers `Cache-Control: public, max-age=1` with `{ event: { id, priceMinor, currency }, seats: [{ id, row, number, state }] }`; `state` is `available`, `held` or `sold`, an expired hold shows as `available`, and no hold ids or holder data are selected. `GET /api/events/:eventId/hold` returns `{ seatIds, expiresAt }` for the caller or 404, with `Cache-Control: no-store`; hold, release and checkout answers are also `no-store`. The browser merges the two (Phase 3).
- **Options.** One personalized seat map (cannot be cached at the edge); `max-age=2` (the plan said 1-2 s; 1 chosen for fresher maps).
- **Trade-off.** Two requests to render a map. The browser cache max-age of 1 s adds to any edge cache TTL (D3), so staleness can reach about 2 s. The seat map reads one statement with every seat of the event (200 rows now, up to 20,000).
- **Status.** `implemented`: Phase 2 it-6; tests `seat-map.route.integration.test.ts` (identical for anonymous and signed-in, no cookie, cacheable one second, 404 `EVENT_NOT_FOUND`), `current-hold.route.integration.test.ts`. D3 itself stays `planned` (edge caching is Phase 5).

### O62. Booking routes are registered only with booking and auth dependencies

- **Context.** `buildApp(config, deps)` takes optional module dependencies so unit tests can build a partial app.
- **Choice.** `backend/src/app.ts` registers the booking plugin under `/api` when `deps.booking` is given, and `buildApp` throws at build time when `deps.booking` is given without `deps.auth` (the plugin needs the auth module's `optionalAuth` for the session lookup). An app without `booking` still builds, with no booking routes. `runtime.ts` passes both.
- **Options.** Make both dependencies required (every test then builds the full graph); skip the routes silently when `auth` is missing (the first version); throw when only `booking` is present (chosen, after the Phase 2 external review, O68).
- **Trade-off.** The silent-skip risk (a caller passing `booking` without `auth` got no booking routes and no error) is resolved: that composition mistake now fails at startup, and the task log shows the message. Tests that build a partial app must leave `booking` out. `mutating-routes-guard.test.ts` still builds the app with both and enumerates the mutating routes.
- **Status.** `implemented`: Phase 2 it-6; `backend/src/app.ts`, `backend/src/runtime.ts`; fail-fast added in the review fix `7b7f11e`, test `backend/src/app.test.ts` ("fails at build time when booking services are given without auth services").

### O63. Deterministic, idempotent catalog seed

- **Context.** The demo needs 12 venues, 200 shows and 200 events with 200 seats each (O9), the same on every machine, safe to run twice.
- **Choice.** `generateCatalogSeed` is a pure function: a fixed `mulberry32` PRNG seed picks titles, genres, venues and prices; ids come from `seedUuid(key)` (SHA-256 of a stable key, version and variant bits set), so a re-run produces the same rows. Only the start times depend on `now` (within 90 days after it). Venues insert `ON CONFLICT (name, city) DO NOTHING`; shows and events `ON CONFLICT (id) DO NOTHING`. Events and their seats are inserted in one transaction: seats are generated in SQL (`generate_series`) only for events inserted by that run, `ON CONFLICT DO NOTHING`, so a re-run adds nothing and never resets a held or sold seat. `npm run db:seed` runs it after the users seed and prints the created counts. It refuses to run with `APP_ENV=production`, because it also creates the well-known admin (O51); loading the catalog in production is a separate command (O69).
- **Options.** Random ids and a count check (a re-run duplicates or skips); a SQL fixture file (no typed, tested generator); inserting seats from application code (40,000 round trips).
- **Trade-off.** An event created by an earlier run keeps its old start time; seeding later does not move it. Seed ids are derived from keys and are not secret.
- **Status.** `implemented`: Phase 2 it-1; files `backend/src/modules/catalog/domain/{catalog-seed-data.ts,seeded-random.ts}`, `application/seed-catalog-service.ts`, `infrastructure/persistence/prisma-catalog-seed-repository.ts`, `backend/src/scripts/{seed.ts,seed-command.ts}`; tests `catalog-seed-data.test.ts`, `seed-catalog-service.test.ts`, `catalog-seed.integration.test.ts` (200 shows, 200 events, 40,000 seats; unchanged on a second run and with a different `now`; held and sold seats kept).

### O69. Catalog loading in production

- **Context.** `db:seed` refuses `APP_ENV=production` because it creates a well-known admin (O51, O63), so a production database had no venues, shows or events and no way to get any. The operator asked how production gets its catalog and the user chose among five options.
- **Options.** (1) Back office only: real events come from `POST /api/admin/events` (Phase 4 it-1), nothing until then. (2) A catalog-only seed command that is allowed in production (chosen). (3) Import from a file: a new format, parser and validation for a demo need. (4) A manual SQL migration: a deploy step that would load demo rows into every database, with no way to skip it. (5) Leave it empty.
- **Choice.** `npm run seed:catalog` (development; `npm run seed:catalog -w backend` is equivalent) and `node backend/dist/scripts/seed-catalog.js` (the production image, which has no `tsx`). It runs only the catalog seed of O63: it never creates or touches a user, takes no `appEnv` and has no production refusal, so it is allowed in production. It is rerunnable (deterministic ids, `ON CONFLICT DO NOTHING`). It prints `catalog inserted venues=<n> shows=<n> events=<n> seats=<n>` and exits 0 (first run 12, 200, 200, 40000; later runs zeros); any argument prints the usage on stderr and exits 2. It loads fictional demo data (12 venues, 200 shows, 200 events starting in the 90 days after the run, 40,000 seats), so it is for demo deployments only. Real events come from the back office (Phase 4 it-1). No import-from-file command exists.
- **Trade-off.** Demo data can end up in a production database; the command does not know which kind of deployment it runs in, so the operator decides. Show start times are relative to the run date: rerunning later adds no shows (ids are fixed), but the events keep the start dates of the first run and can be in the past.
- **Status.** `implemented`: files `backend/src/scripts/{seed-catalog-command.ts,seed-catalog.ts}`, scripts `seed:catalog` in the root and backend `package.json`; tests `seed-catalog-command.test.ts` (no arguments inserts and prints the counts; an argument gives usage and exit 2), `seed-catalog.integration.test.ts`. Verified once through the compiled entry point (exit 0, the counts above, zeros on a rerun).

### O64. Hold sweeper

- **Context.** Lazy expiry (D2) is enough for correctness; stale `held` rows remain until touched.
- **Choice.** `ExpireHoldsService.sweep({ batchSize })` reads the clock once and runs two bounded batch statements until a batch is short: free seats with `held_until <= $now` (`WHERE id IN (SELECT ... LIMIT n FOR UPDATE SKIP LOCKED)`), then mark empty active holds past `expires_at` `expired`. `SKIP LOCKED` lets several instances and in-flight hold transactions pass over rows someone else is changing. It is idempotent. Nothing calls it on a schedule: no scheduler exists in this repository. A one-off command (default batch size 500, range 1-10000) runs the sweeper once and prints `holds swept freedSeats=<n> expiredHolds=<n>`; bad arguments print the usage and exit 2. In production the invocation is the compiled script, `node backend/dist/scripts/sweep-holds.js --batch-size=<n>`, because the production image installs with `--omit=dev` and has no `tsx`; `npm run sweep:holds -- --batch-size=<n>` is the development and local equivalent only. The third external review round found the docs naming the npm command for production; fixed docs-only, the code already compiled into `dist`. Unlike the seed it works in production (it only frees expired holds). `ScriptContext` now also exposes `prisma` so the command can build the booking services. It is meant to run as a one-off ECS task or as an EventBridge Scheduler target; the repository configures neither.
- **Options.** A `setInterval` in each instance (runs on every instance, not stateless-safe); a database-side scheduled job (a second place to deploy and monitor); no sweeper.
- **Trade-off.** Risk: the filter `status = 'held' AND held_until <= $now` across all events has no supporting index (the indexes are `(event_id, status)` and `(hold_id)`), so a sweep scans the seats table. The fix is a partial index on `seats(held_until) WHERE status = 'held'`; it is not needed at 40,000 seats and is left out until a sweep shows up as slow.
- **Status.** `implemented` (the query and service): Phase 2 it-4; tests `prisma-hold-sweeper.integration.test.ts` (frees only expired seats, idempotent, untouched at `expires_at` minus 1 second), `prisma-hold-sweeper.batches.integration.test.ts` (25 seats in batches of 10; two concurrent sweeps). The command is `implemented` (`backend/src/scripts/sweep-holds-command.ts`, `sweep-holds.ts`; tests `sweep-holds-command.test.ts` (default 500, `--batch-size`, exit 2 on bad arguments), `sweep-holds.integration.test.ts` (frees expired holds only, a second run frees nothing)). The scheduler is `planned`, no phase yet.

### O65. Foreign key actions and extra indexes

- **Context.** The Phase 2 plan listed the constraints but not the delete behaviour of each foreign key or every supporting index.
- **Choice.** `ON DELETE RESTRICT` on `holds.user_id`, `bookings.user_id`, `seats.hold_id` and the other booking foreign keys, so deleting a user, hold or event with history fails instead of erasing it; `seats.event_id` is `CASCADE` (seats belong to the event). `SET NULL` on `seats.hold_id` was rejected: it would leave a `held` seat without a hold and violate `seats_hold_consistency_check`; `SET NULL` on `holds.user_id` would violate the holder CHECK. Indexes beyond the plan, for foreign keys that Prisma and the queries use: `events(show_id)`, `events(venue_id)`, `holds(event_id)`, `holds(user_id)`, `bookings(event_id)`, `tickets(booking_id)`, `payments(hold_id)`.
- **Options.** `CASCADE` everywhere (deleting a user would delete bookings and tickets); no extra indexes (a foreign key delete or join scans the child table).
- **Trade-off.** More write cost on those tables; deleting a user or event needs explicit clean-up first (account deletion, if ever built, must handle it).
- **Status.** `implemented`: Phase 2 it-1; `backend/prisma/migrations/20261126130000_booking_schema/migration.sql`; tests `catalog-booking-schema.integration.test.ts`. The first version of this migration was broken and was fixed before this entry; see `docs/ai-workflow-log.md`.

### O66. Transaction timeouts

- **Choice.** Interactive Prisma transactions for hold, release, adoption and confirm use `maxWait` and `timeout` of 10 s (`PrismaHoldRepository.inTransaction`, `TX_OPTIONS` in `prisma-checkout-repository.ts`). Prisma's default is 5 s for the transaction and 2 s to acquire a connection.
- **Options.** Prisma defaults (a 100-way contention burst on one row can exceed 2 s of connection wait on a small pool); a longer value (hides stuck transactions).
- **Trade-off.** A stuck transaction holds a connection and row locks for up to 10 s. The latency targets (hold p95 < 50 ms) are separate and are a Phase 5 measurement, not enforced by this timeout.
- **Status.** `implemented`: Phase 2 it-3, it-5; the 100-parallel-holds test runs within it.

### O67. Checkout price is read at checkout time

- **Context.** A booking copies the event's unit price when it is confirmed (plan: money section). The seat map shows the current price. The hold does not freeze a price: it records seats and an expiry only.
- **Choice.** The price is read at checkout, in the first clock read of the lookup phase, and stored in the booking (`unit_price_minor`, `total_minor`, `currency`).
- **Options.** Freeze the price on the hold (needs a price column on the hold and a back-office rule for price changes); read the price at checkout (chosen).
- **Trade-off.** Once a price-change path exists (Phase 4 back office), a buyer could hold at price A and pay price B. No such path exists in Phase 2, so the risk is latent. Raised by the Phase 2 external review and accepted for now; revisit in Phase 4 it-1, when events become editable.
- **Status.** `implemented`: `backend/src/modules/booking/infrastructure/persistence/prisma-checkout-repository.ts` (`findHoldForCheckout`); tests `prisma-checkout-repository.integration.test.ts`, case "the booking stores the price in force at checkout, not the price at hold time" (the price is changed after the hold; the booking carries the new one).

### O68. External review of Phase 2

- **Context.** Another agent ran the `review-suite` twice over the Phase 2 branch, outside the run that built it.
- **Choice.** Fixed (commit `7b7f11e` and the `sweep:holds` commit): `Cache-Control: no-store` on seat release answers; a `voided` payment row on `hold_gone` (D4); `buildApp` fails fast when booking is given without auth (O62); the hold repository's broken-invariant case throws `InfrastructureError("Invariant broken: no active hold after get-or-create")` instead of a generic `Error` (test `prisma-hold-repository.invariants.test.ts`); the `sweep:holds` command (O64; its production invocation is the compiled `node backend/dist/scripts/sweep-holds.js`, a docs-only fix from the third review round); tests for the anonymous release answer carrying `no-store` (`release-seat.route.integration.test.ts`) and for the price in force at checkout (O67). Dropped, with the reason: adopting visitor holds is not an extra cost on every read, it runs once because the `vid` cookie is cleared in the same response (O60); freezing the price on the hold is not needed until prices are editable (O67); the generated Prisma client is not tracked, it is gitignored. Accepted and kept: the mock gateway takes the payment outcome from the client (documented operator TODO in the release guide); the raw SQL surface stays; the sweeper is not scheduled by the repository.
- **Options.** Fix every suggestion; drop the ones that rest on a wrong premise (chosen: three were dropped).
- **Trade-off.** The accepted items remain open risks (the mock gateway must not face real customers; a scheduled sweep needs operator work). One suggestion (a tracked generated client) was wrong, and the no-store test for anonymous release was a regression guard that passed as soon as it was written, so it shows no failing run.
- **Status.** `implemented`: files and tests as listed above. The review is repeated after these fixes; its result is not recorded here.

### O70. Show search

- **Context.** The discovery screen needs public search over 200 shows and 40,000 seats with combinable filters (plan section 2; first sketched in O10).
- **Options.** One row per show (hides dates and seats left) or per event (chosen); a default window of every event (past events clutter results) or upcoming only (chosen); silently ignoring unknown parameters (a typo such as `citty` returns an unfiltered list) or rejecting them (chosen); a stored seat counter (a second source of truth) or a grouped count per page (chosen); a `UNION` of the two text matches or one `OR` (chosen for now).
- **Choice.** `GET /api/shows` returns one row per event. Without `from`, only events with `starts_at > now` are listed; `from` replaces that rule (`starts_at >= from`), `to` is inclusive, and `from` after `to` is 400 `invalid_date_range`. The facets endpoint uses the same rule (values that have an upcoming event). Unknown or empty query parameters are rejected with 400 (`propertyNames` plus `additionalProperties: false`, because Ajv would otherwise drop them). Limits: `q`, `type`, `genre`, `city` 1 to 100 characters, `page` 1 to 100000, `pageSize` 1 to 50 (default 20). `country` is two letters, upper-cased by the query; the other text filters are exact and case-sensitive. `q` is `plainto_tsquery('simple', q)` against `shows.search_vector` (generated column, GIN index) OR `ILIKE` on the venue name with `%`, `_` and `\` escaped. The answer is `{ items, total, page, pageSize, totalPages }`; a page past the end returns empty `items` with the real `total`. The count and the page run in parallel, `seatsLeft` is one grouped query for the page's events with the lazy-expiry rule (`available`, or `held` with `held_until <= now`) and a bound `now`, never SQL `now()`; the clock is read once. Cache headers: `public, max-age=1` for search, `public, max-age=60` for facets.
- **Trade-off.** Matching is exact-word plus substring: no typos, no ranking. EXPLAIN finding at 40,000 seats: the planner prefers sequential scans, and the `OR` between the text-search match and the venue `ILIKE` cannot use the GIN index. Both are fast at this size. If the catalog grows, the fix is a `UNION` of the two matches; it is a deliberate risk, not built. The default window hides past events from anyone who wants them unless the client sends `from`. The 1 s browser cache stacks on any edge cache (D3), and the search answer can lag a hold by about that long. The page count and the page are not read in one snapshot, so `total` can differ by a row from the page under concurrent writes.
- **Status.** `implemented`: Phase 3 it-1; migration `backend/prisma/migrations/20261127100000_shows_search/migration.sql`; files `backend/src/modules/catalog/application/{search-events-query.ts,get-facets-query.ts}`, `infrastructure/persistence/{event-search-sql.ts,prisma-event-search-reader.ts,prisma-facets-reader.ts}`, `presentation/http/{catalog-dto.ts,routes/shows-search.route.ts,routes/shows-facets.route.ts}`; tests `search-events-query.test.ts`, `get-facets-query.test.ts`, `event-search-sql.test.ts`, `shows-search.route.integration.test.ts`, `shows-facets.route.integration.test.ts`. This entry merges the plan rows "search result unit", "text search", "date-time filter", "filters" and "pagination".

### O71. Event detail

- **Context.** The event page needs the show, venue, start and price before the seat map loads.
- **Options.** Reuse the seat map answer (it carries no show or venue); a string id with a 404 for anything unknown (a malformed id would reach SQL); a uuid schema (chosen).
- **Choice.** `GET /api/events/:eventId` validates the id as a uuid (400 when malformed), answers 404 `EVENT_NOT_FOUND` with the catalog's own `EventNotFound` for an unknown id, returns the event even when it has already started (a buyer with a link or a booking can still open it), and sends `Cache-Control: public, max-age=1`. It reads no cookie.
- **Trade-off.** A started event is shown with a past date and no seat availability rule of its own; the screen decides what to offer. The same 1 s staleness as O70.
- **Status.** `implemented`: Phase 3 it-2; files `backend/src/modules/catalog/application/get-event-query.ts`, `infrastructure/persistence/prisma-event-detail-reader.ts`, `presentation/http/routes/event-detail.route.ts`; tests `get-event-query.test.ts`, `event-detail.route.integration.test.ts`.

### O72. My bookings

- **Context.** A signed-in buyer needs their tickets and codes; the plan's security principle is that only the caller's bookings are returned.
- **Options.** Filter in application code after a wider query (a missing filter leaks); `user_id` in the SQL itself (chosen); one query per booking (N+1); unbounded list or a cap.
- **Choice.** `GET /api/me/bookings` returns only `confirmed` bookings, newest first (`created_at DESC, id DESC`), at most `MY_BOOKINGS_LIMIT` (100), with at most two queries: the bookings joined to event, show and venue (`user_id = $1` is part of the SQL), then all their tickets in one `ANY(...)` query. Tickets are sorted by row length, then row label, then seat number, so row `AA` comes after `Z`. The answer is `Cache-Control: no-store` with `Vary: Cookie`; an anonymous caller gets 401 `UNAUTHENTICATED` from the shared `requireAuth` hook.
- **Trade-off.** More than 100 confirmed bookings are not reachable (no pagination); a `rejected` booking never produced a ticket and is not shown. The first query is served by `bookings(user_id, created_at DESC)`.
- **Status.** `implemented`: Phase 3 it-2; files `backend/src/modules/booking/application/list-my-bookings-query.ts`, `infrastructure/persistence/prisma-my-bookings-reader.ts`, `presentation/http/routes/my-bookings.route.ts`; tests `list-my-bookings-query.test.ts`, `prisma-my-bookings-reader.integration.test.ts` (ownership, order, limit), `my-bookings.route.integration.test.ts`.

### O73. Guest access: link, exchange, session

- **Context.** D5 chose a single exchange of an emailed link into a booking-scoped session. This entry records how it is built.
- **Options.** Token in the query string (reaches logs and Referer) or in the fragment (chosen); reading the link state first and then consuming (check-then-write) or one conditional consume (chosen); consuming first and then reading the booking and creating the session (the original flow: a failure in between burned the link; superseded in the Phase 3 review) or one statement that consumes the link and creates the session (chosen in the Phase 3 review); issuing the link inside the booking transaction (an email failure would roll back a paid booking) or after the commit (chosen); guest-access importing booking's checkout or booking owning a port (chosen); HTML email or plain text (chosen: the `EmailProvider` has no html field).
- **Choice.** The error kind `gone` maps to 410 with `LINK_USED`, `LINK_EXPIRED` and `LINK_INVALID`; an unknown link and an invalidated (replaced) one are both `LINK_INVALID`, so a caller cannot tell them apart. The original flow consumed the link with one conditional `UPDATE` first, then read the booking, then created the session; a failure after the consume burned the link and left the buyer without access. That sentence is changed in the Phase 3 review (commit `2afe774`). The exchange now runs in this order: (a) read the usable link (`findUsableBookingIdByTokenHash`); (b) read the booking with its tickets through booking's public query, and a null result is `LinkInvalid` and the link is NOT consumed; (c) one statement, `consumeAndCreateSession` (`WITH consumed AS (UPDATE ... RETURNING) INSERT INTO guest_sessions ... SELECT FROM consumed`), so the link and the session exist together or not at all, and a failing insert rolls back the consume; (d) the route answers from the booking read during the exchange, with no second lookup and no orphaned session without a cookie. The link state is still read only after a lost consume, to choose the code (used, expired or invalid). A link whose email failed to send is invalidated (changed in the Phase 3 review; best effort, logged with the booking id only; the booking never fails). Tokens are 32 random bytes from Node crypto; only the SHA-256 is stored (links and sessions). The link is `FRONTEND_ORIGIN/guest/access#t=<token>`, valid `GUEST_LINK_TTL_HOURS` (168); the session lasts until the event start plus 1 day. Checkout issues the link after the booking commit, outside its transaction; a failure to store or send the link never fails the booking and is logged with the booking id only. Booking owns the `GuestLinkIssuer` port; `backend/src/booking-with-guest-access.ts` (the composition root) implements it with a late-bound reference, so neither module imports the other's internals and there is no cycle. One email per booking, plain text. The cookie `gsid` is `HttpOnly`, `SameSite=Lax`, `Path=/api`, `Secure` when `COOKIE_SECURE` is true. Guest and user credentials are separated by distinct cookie names (`gsid`, `sid`) and separate hooks (`requireGuestSession` for `GET /api/guest/booking`, `requireAuth` for user routes); this code has no global `registerAppHooks` credential-separation hook, so that is a per-route hook choice, not an app-wide one. `requireGuestSession` reads the booking once and sets `request.guestSession`. Schemas: exchange body `{ token }` of 20 to 200 characters, resend body `{ email }` of at most 254 characters, both strict. Exchange and resend compose the shared CSRF and Origin hooks.
- **Trade-off.** If the link cannot be stored or the send fails, a paid booking exists with no email; recovery is the resend form (O74). A guest who clears cookies needs a new link. The Phase 3 review change costs one extra read per exchange, and a losing concurrent exchange may read the booking before it loses at the consume (it then gets `LINK_USED`, as before). Invalidating the link after a failed send is best effort: if that update also fails, the unsent link stays valid until it expires or a resend replaces it. The link and session tables have no retention job yet: expired and consumed rows are inert and stay until a later sweep (Security, "Before production").
- **Status.** `implemented`: Phase 3 it-3; migration `backend/prisma/migrations/20261127110000_guest_access_schema/migration.sql`; files under `backend/src/modules/guest-access/` (`application/{issue-guest-link-service.ts,exchange-guest-link-service.ts,get-guest-booking-query.ts,guest-link-email.ts}`, `domain/errors.ts`, `infrastructure/`, `presentation/http/`), `backend/src/booking-with-guest-access.ts`, `backend/src/modules/booking/application/{checkout-service.ts,ports/guest-link-issuer.ts}`; tests `issue-guest-link-service.test.ts` (invalidates the link when the send fails), `exchange-guest-link-service.test.ts` (booking missing: link not consumed), `get-guest-booking-query.test.ts`, `errors.test.ts`, `checkout-guest-link.test.ts`, `prisma-guest-link-repository.integration.test.ts` (concurrent double exchange yields one session; consume and session together or neither), `prisma-guest-session-repository.integration.test.ts`, `guest-exchange.route.integration.test.ts` (no orphaned session), `mutating-routes-guard.test.ts` (the every-state-changing-route CSRF and Origin test now includes `POST /api/guest/exchange` and `POST /api/guest/resend`), `guest-exchange-secure-cookie.route.integration.test.ts`, `guest-booking.route.integration.test.ts`, `guest-checkout.integration.test.ts`. The Phase 3 review changes landed in `2afe774` (files `exchange-guest-link-service.ts`, `issue-guest-link-service.ts`, `ports/guest-link-repository.ts`, `prisma-guest-link-repository.ts`, `routes/exchange.route.ts`); the finding is recorded in O82. This entry covers the plan rows "guest link", "guest link lifetime" and "tokens".

### O74. Guest link resend and its limit

- **Context.** A lost link needs a way back that cannot be used to find out which emails have bookings or to flood a mailbox.
- **Options.** An in-process counter (not a control across instances, rule 40); a counter column on the booking; a table of attempts (chosen); count-then-insert under READ COMMITTED (concurrent callers both see the old count and pass) or serialized by a transaction advisory lock (chosen).
- **Choice.** `POST /api/guest/resend` runs the limiter before any booking lookup. The limiter stores one row per attempt in `guest_resend_attempts` keyed by the SHA-256 of the lower-cased email, and `pg_advisory_xact_lock` on that hash makes count and insert atomic. A refused attempt is not recorded, so the window drains. The answer is 204 for every well-formed email, byte-identical whether bookings exist or not, and 429 `RATE_LIMITED` once `GUEST_RESEND_LIMIT` (3) is reached within `GUEST_RESEND_WINDOW_MINUTES` (60), with no `retryAfter` (superseded on 2026-11-27: see the Retry-After paragraph below; the 429 now carries it). For known upcoming confirmed guest bookings it invalidates the older unused links, revokes the guest sessions, and issues one new link per booking. Retention of the guest tables and of old attempt rows is deferred to a later sweep.
- **Retry-After (Phase 3 review, 2026-11-27, commit `2f2bc18`).** The earlier statement "429 with no `retryAfter`" is `superseded` by this note; it is kept above for the record. The 429 now carries a `Retry-After` header and the body field `retryAfterSeconds`, the convention of the auth routes (O43, O44). The limiter computes it inside the advisory-locked transaction as the oldest attempt in the window plus the window minus now, rounded up, at least 1. It is identical for every email, because the limiter runs before any booking lookup, so it leaks nothing. Options: no hint (the old behavior; the buyer cannot tell when to retry), a fixed window length (overstates the wait), or the exact computed wait (chosen).
- **Trade-off.** The limit is per email address, not per booking. The doc comment of `GUEST_RESEND_LIMIT` in the config module and the `.env.example` line used to say "per booking"; both now say per email address. The 429 and its `Retry-After` are the same for every email, so they reveal nothing about bookings, but the hint does tell a caller how many attempts for that address are still in the window (it shows when the oldest one leaves), which is acceptable because the caller already supplied the address. Also, a person who requests a third link for one address blocks that address for the window, including a legitimate owner. The advisory lock serializes concurrent resends for one email only.
- **Status.** `implemented`: Phase 3 it-3; files `backend/src/modules/guest-access/application/resend-guest-links-service.ts`, `infrastructure/persistence/prisma-guest-resend-limiter.ts`, `presentation/http/routes/resend.route.ts`; tests `resend-guest-links-service.test.ts`, `prisma-guest-resend-limiter.integration.test.ts` (parallel attempts; the wait seconds), `guest-resend.route.integration.test.ts` (429 carries the header and the body field). The Retry-After change is in `2f2bc18` (files `ports/guest-resend-limiter.ts`, `prisma-guest-resend-limiter.ts`, `resend-guest-links-service.ts`, `routes/resend.route.ts`). Rows "lost link" of the plan and D5 are covered here.

### O75. Frontend discovery

- **Context.** `/` needs the search screen; the buyer must be able to share and restore a search (plan row "filter state", rule 30).
- **Options.** Component state (lost on reload); the URL query string (chosen); fixed `/100` prices or the currency's own digits (chosen); the browser's time zone or the venue's (chosen: the venue); dropping the previous results while the next page loads or dimming them (chosen).
- **Choice.** Discovery replaces the placeholder Home at `/` (Home is removed). Every filter, the page and the dates live in the URL; invalid parameters are normalized (dropped or clamped) on read. The search box commits after 300 ms and replaces the history entry, so typing does not fill Back. Prices use `Intl.NumberFormat` with the currency's own minor-unit digits (JPY has none), instead of dividing by 100. Start times are shown in the venue's IANA time zone with the zone name. The previous results stay on screen, dimmed, while the next page loads. There is one Clear filters button.
- **Trade-off.** Known gaps: the Mantine `Select` clear button is not reachable by keyboard, and the country options show codes (`DE`), not names. A currency or zone the browser does not know falls back to a fixed format or UTC.
- **Status.** `implemented`: Phase 3 it-5; files `frontend/src/features/discovery/`, `frontend/src/shared/lib/format.ts`, `frontend/src/app/router.tsx`; tests `discovery-filters.test.tsx`, `discovery-results.test.tsx`, `search-params.test.ts`, `shows-api.test.ts`. Noted in the log: the red run was an import failure only.

### O76. Base theme and DateTimeRangePicker v1

- **Context.** The brief asks for themed components, not library defaults, and for a date-time range control Mantine does not have (O12).
- **Options.** Mantine defaults with custom CSS later (a library look if Phase 6 is cut); a theme from the first screen (chosen). For the picker: two separate controls, or one composed control (chosen).
- **Choice.** The theme: palette `seat` (ten shades, primary), the system font stack (no webfont download, no layout shift), default radius `md`, applied to every screen. `DateTimeRangePicker` composes Mantine's range calendar and time inputs in one popover. It applies changes live (no Apply button) and emits ISO instants only when both days are chosen and both times are valid; the defaults are 00:00 and 23:59 local; a same-day range whose end is not after the start is clamped, with a message; it follows its controlled value, so Clear filters and Back reset it.
- **Trade-off.** Local time of the browser, not the venue (O75 shows the venue's zone on each result). Presets and depth stay in Phase 6. It depends on `@mantine/dates` and `dayjs` (O80).
- **Status.** `implemented`: Phase 3 it-4; files `frontend/src/app/theme.ts`, `frontend/src/shared/ui/date-time-range-picker/`; tests `theme.test.ts`, `date-time-range-picker.test.tsx`. Covers the plan row "base theme".

### O77. SeatMap v1 and the event page

- **Context.** Plan flows 2, 6 and 7: click to hold, a countdown, a map that stays current.
- **Options.** A canvas map (no accessible seats) or SVG with `role="button"` seats (chosen); colour alone for state or shape plus glyph plus colour (chosen); SSE or polling (polling, O11); optimistic updates or waiting for the server (chosen); toasts (would add `@mantine/notifications`) or inline alerts (chosen).
- **Choice.** Seats are SVG elements with `role="button"` and labels such as `Row C, seat 7, available`. Four states (available, held by someone else, held by me, sold) differ by shape, glyph and colour. My seats come only from `GET /api/events/:eventId/hold`, overlaid on the public map as `held_by_me`. The map polls through `refetchInterval` (`VITE_SEAT_POLL_INTERVAL_MS`, 3000) only while the page is mounted and the tab is visible. The countdown uses `Date.now()` against the hold's `expiresAt`, because the hold DTO carries no server time. Errors show as inline alerts. There is no optimistic UI: a click waits for the server's answer.
- **Trade-off.** A client clock that is wrong shows a wrong countdown; the server stays authoritative at hold and checkout (the buyer sees `HOLD_EXPIRED` on payment). Without optimistic updates a click shows its result after one round trip. No new dependency is added for notifications.
- **Status.** `implemented`: Phase 3 it-6; files `frontend/src/shared/ui/seat-map/`, `frontend/src/features/event/`; tests `seat-map.test.tsx`, `event-page.test.tsx`. Covers the plan row "live seat status".

### O78. Checkout panel and the test payment

- **Context.** Checkout must work for both signed-in buyers and guests, on a gateway that is a mock (O8).
- **Options.** The client sends an idempotency key or the backend derives it (chosen: derived); hiding the outcome choice (the mock then has no failure path to test) or showing it labelled (chosen); showing tickets right after a guest checkout or only through the emailed link (chosen).
- **Choice.** The client sends no idempotency key; the backend derives `hold:<holdId>` and would ignore a client key. The payment outcome is chosen by the client only because the gateway is a mock; the UI labels it "Test payment". This is the open operator decision recorded in the Phase 2 release guide (the mock gateway must not face real customers; see O68). A guest's confirmation shows no tickets and no QR: they come through the emailed link, which proves access to the email. The guest email is validated in the client for usability only; the server validates it again (`GUEST_EMAIL_INVALID`). Checkout is its own feature (`features/checkout/`), which the event feature composes.
- **Trade-off.** A guest who mistypes the address pays and gets no link until they use the resend form with the right one (which finds no booking). The outcome choice is a testing aid, not a production behavior.
- **Status.** `implemented`: Phase 3 it-7; files `frontend/src/features/checkout/`, `frontend/src/features/event/`; tests `checkout.test.tsx`.

### O79. Tickets and guest screens

- **Context.** Plan flows 4 and 5, and the QR payload of the Security table.
- **Options.** An inline SVG QR (injecting markup) or a PNG data URL in an `<img>` (chosen); leaving the token in the address bar until the response arrives or removing it first (chosen); a different resend answer when the address is known (never).
- **Choice.** `TicketQr` renders `qrcode`'s PNG data URL in an `<img>`, payload `SEATHOLD:<code>`; the code is also printed. `BookingCard` lives in `shared/ui` and serves both My bookings and the guest page. The guest page reads the `#t=` fragment, removes it from the address bar before sending the request, and a ref guards React StrictMode's second effect run from posting the token twice. The resend form shows the same neutral message for every address, and a 429 gets its own message. An exchange answer of 400 (a malformed or too-short token, which the body schema bounds to 20 to 200 characters) is shown as "This link is not valid" with the resend form, not as a server error (changed in the Phase 3 review, commit `82fcf8d`); 5xx, network errors, 401 and 403 stay the generic error. `/bookings` is behind `RequireAuth`, and the page also handles a 401 in place with a sign-in prompt (the session can end after the guard ran).
- **Trade-off.** The QR is generated in the browser, so offline display needs the page loaded once. Removing the fragment means a reload cannot reuse the token (by design: the link works once).
- **Status.** `implemented`: Phase 3 it-8; files `frontend/src/shared/ui/{ticket-qr,booking-card}/`, `frontend/src/features/{my-bookings,guest}/`, `frontend/src/features/auth/components/user-menu.tsx`, `frontend/src/app/router.tsx`; tests `ticket-qr.test.tsx`, `my-bookings-page.test.tsx`, `my-bookings-route.test.tsx`, `guest-access-page.test.tsx` (the 400 and 403 cases, `use-guest-access.ts`; the 429 wait), `user-menu.test.tsx`. Covers the plan row "QR". Phase 3 review round 2: an exchange 403 shows "We could not verify this request" with the resend form (the API client already retried the CSRF once, so a persisting 403 is a stale page or wrong origin, not a server fault), and the resend 429 shows the wait from `retryAfterSeconds` through the shared `formatRetry` (moved to `frontend/src/shared/lib/format.ts`).

### O80. Phase 3 dependencies and configuration

- **Context.** The user approved the new dependencies during the run (plan it-0). Exact pins follow O26 and rule 12.
- **Choice.** `qrcode` 1.5.4 and `@types/qrcode` 1.5.6 (dev) for the QR; `@mantine/dates` 9.8.2 (same version as `@mantine/core`) and `dayjs` 1.11.23 (its peer) for the picker. New settings, validated at startup by the typed config module: `GUEST_LINK_TTL_HOURS` (168), `GUEST_RESEND_LIMIT` (3), `GUEST_RESEND_WINDOW_MINUTES` (60), all positive integers, and the public frontend setting `VITE_SEAT_POLL_INTERVAL_MS` (3000). None is a secret.
- **Options.** A QR drawn by hand or by a server route (more code, or tickets rendered where logs can see them); a picker built on native inputs (no calendar); a dependency each (chosen).
- **Trade-off.** Four more packages to patch; `dayjs` is only there for Mantine's date components.
- **Status.** `implemented`: Phase 3 it-0; files `frontend/package.json`, `backend/src/config/load-config.ts`, `frontend/src/app/config/load-frontend-config.ts`, `.env.example`; tests `backend/src/config/load-config-guest.test.ts` (the frontend setting is checked in the frontend config tests).

### O81. Frontend test toolchain: Vitest `vmThreads`

- **Context.** The frontend suite took 15 to 23 s, a cost paid on every `verify-fast-part` run.
- **Options.** The default pool; `pool: 'vmThreads'` with `isolate` kept (chosen); `isolate: false` (rejected: state leaked between tests).
- **Choice.** `frontend/vitest.config.ts` sets `pool: 'vmThreads'`; jsdom and test isolation stay. Measured over three runs each: the default pool 15.4 s, 19.7 s and 22.9 s; `vmThreads` 11.7 s, 12.2 s and 11.8 s, with all 216 tests passing in every run.
- **Trade-off.** `vmThreads` runs tests in VM contexts of shared worker threads; Vitest documents it as the less mature pool (memory growth and ESM edge cases are known). If a test starts to behave differently there, switch back to the default pool.
- **Status.** `implemented`: Phase 3 review, commit `82fcf8d`; file `frontend/vitest.config.ts`.

### O82. External review of Phase 3

- **Context.** Another agent (reviewer `SH-cursor`) ran the review-suite over the Phase 3 branch, outside the run that built it, as for Phase 2 (O68). The first delegation did not return a result (unmatched, cancelled). The retry ended `uncertain` (another-user-input), and the result was obtained through a follow-up request.
- **Findings.** 0 Critical, 5 Important, 6 suggestions.
- **Choice.** Important: the exchange was not atomic (fixed in `2afe774`, O73); the exchange route read the booking twice (fixed in `2afe774`, O73); the CSRF and Origin guard test missed the guest routes (fixed in `2afe774`, `mutating-routes-guard.test.ts`); no release guide (addressed by `docs/release_guides/phase-3-buyer-flow.md`); the roadmap was not updated (updated in the statuses commit). Suggestions: an email failure after the link insert left a valid unsent link (fixed: the link is invalidated, O73); the resend 429 had no `Retry-After` (fixed in `2f2bc18`, O74); the search `OR` cannot use the GIN index (accepted as a deliberate risk, O70, documented in the release guide); no retention of the guest tables (deferred, O73 and O74, documented in the release guide as an operator item); a malformed guest token showed a server error (fixed in `82fcf8d`, O79); the Vitest pool (adopted, O81).
- **Options.** Fix everything; fix and defer with a named place for each open item (chosen).
- **Trade-off.** Two open items remain: the search `OR` (planner risk at a larger catalog) and the missing retention sweep for guest links, sessions and resend attempts. Neither blocks the phase; both are tracked where stated. The review itself was not repeated at the time of this entry, so its result is not claimed here.
- **Second round (fix slice only, `3e31709..HEAD`).** SH-cursor found 0 Critical, confirmed that all five first-round Important findings are resolved, and raised one Important item and three suggestions: the in-memory link repository used in unit tests did not roll the consume back when the session insert failed, unlike the SQL statement (fixed: the fake is atomic and a test proves the link stays consumable); the resend form ignored `retryAfterSeconds` (fixed: it shows the wait); a 403 on the exchange showed the generic server error (fixed: it shows that the link could not be checked, with the resend form); and a connection dropped after a successful exchange leaves a session without a cookie (accepted: documented in the release guide, recovery is the resend form). As the run rules say, there is no third review round.
- **Status.** `implemented` for the fixes (commits `2afe774`, `82fcf8d`, `2f2bc18` and the statuses commit; tests as listed in O73, O74, O79 and O81). `planned` (accepted, not built) for the search `OR` (O70) and for the retention sweep (O73, O74; the release guide lists it as an operator item).

### O83. Catalog owns the event and seat write

- **Context.** Creating an event writes `shows`, `venues`, `events` and up to 20,000 `seats`. Those tables belong to the catalog module; the back office must not write them with its own SQL.
- **Options.** Back-office SQL over catalog tables; a catalog repository method per table called in a loop; one catalog port that writes the whole event (chosen).
- **Choice.** Catalog defines the `EventGridWriter` port (`catalog/application/ports/event-grid-writer.ts`) and a Prisma adapter (`PrismaEventGridWriter`); both leave `catalog/index.ts`. The back-office `CreateEventService` validates, then calls the port through that public API. Show, venue, event and seats are written in one transaction, so a failure leaves nothing behind. An unknown existing show or venue is 404 (`SHOW_NOT_FOUND`, `VENUE_NOT_FOUND`).
- **Trade-off.** Catalog grows a write path used by one caller. In return the table owner keeps its SQL and the back office keeps no catalog SQL.
- **Status.** `implemented` (Phase 4 it-1): `catalog/application/ports/event-grid-writer.ts`, `catalog/infrastructure/persistence/prisma-event-grid-writer.ts`, `backoffice/application/create-event-service.ts`; tests `prisma-event-grid-writer.integration.test.ts`, `create-event-service.test.ts`, `create-event.route.integration.test.ts`.

### O84. New venue by (name, city): reuse only when country and timezone match

- **Context.** `venues` has `UNIQUE(name, city)`. An operator who types a new venue that already exists must not create a duplicate, and must not silently change what a venue is.
- **Options.** Plain insert and map the unique violation to 409; reuse the existing row whatever country and timezone were typed; reuse only on an exact match and refuse otherwise (chosen).
- **Choice.** A new venue whose (name, city) exists is reused only when its country code and timezone equal the typed ones. Otherwise the request fails with 409 `VENUE_CONFLICT` and nothing is written. The first cut was `ON CONFLICT (name, city) DO UPDATE SET name = EXCLUDED.name`, a no-op upsert where the existing country and timezone silently won. Review showed that an operator typing a different timezone would get an event with a start time shown in the wrong zone and no warning. That first cut is `superseded` by the match rule above.
- **Trade-off.** An operator who really wants to change a venue's timezone is refused and must pick the existing venue; there is no venue editor (out of scope). The match is checked inside the same transaction as the insert.
- **Status.** `implemented` (Phase 4 it-1, changed after review): `prisma-event-grid-writer.ts`; tests `prisma-event-grid-writer.integration.test.ts`, `create-event.route.integration.test.ts`; the frontend shows a fixed message (O105).

### O85. Seat grid: one INSERT ... SELECT in one transaction

- **Context.** An event can have up to 20,000 seats (O17). Inserting them row by row from the application would be slow and chatty.
- **Options.** One insert per seat; batched multi-row inserts from TypeScript; one `INSERT ... SELECT` over `unnest` and `generate_series` (chosen).
- **Choice.** The row labels come from the TypeScript `rowLabel` (A to Z, then AA; `catalog/domain/row-label.ts`) and are passed as one text array. The seats are `INSERT INTO seats ... SELECT ... FROM unnest($labels) CROSS JOIN generate_series(1, seatsPerRow)`, in the same transaction as the event, with a 30 s transaction timeout. A 100 x 200 grid (20,000 seats) measured about 0.4 to 0.5 s locally.
- **Trade-off.** The label rule lives in TypeScript, not SQL, so it is unit tested once and shared by the seed; the generated SQL depends on the array parameter. The 30 s timeout is generous on purpose; a slow database fails the whole event cleanly.
- **Status.** `implemented` (Phase 4 it-1): `prisma-event-grid-writer.ts`, `row-label.ts`; tests `row-label.test.ts`, `prisma-event-grid-writer.integration.test.ts` (exact count, AA after Z, rollback).

### O86. Create-event validation: explicit bounds, code `INVALID_EVENT`

- **Context.** The back office takes free-form input that creates up to 20,000 rows. Phase 4 security principle: explicit bounds.
- **Options.** Bounds only in the HTTP schema; bounds only in the database; bounds in the back-office domain with a shape-only HTTP schema (chosen).
- **Choice.** `parseCreateEvent` (`backoffice/domain/create-event-rules.ts`) throws `InvalidEvent` (400, `INVALID_EVENT`; the message names the field and the bound, never the value). Show text fields 1 to 100 characters (description 0 to 2000); venue name, city and timezone 1 to 100; price 0 to 1,000,000 minor units; `rows` and `seatsPerRow` 1 to 200 and at most 20,000 seats; `startsAt` an ISO instant with offset, after `now` (the operation's clock read) and at most 3 years ahead; timezone must be an IANA zone (checked with `Intl.DateTimeFormat`); country code 2 letters and currency 3 letters, both upper-cased; for show and for venue exactly one of `existingId` and `new`. The HTTP schema checks shape and rejects unknown fields (`propertyNames` plus `additionalProperties: false`, because Ajv would otherwise strip them).
- **Trade-off.** Two layers (shape in HTTP, bounds in domain) mean the 400 code differs by layer: a wrong type is a schema 400, an out-of-range value is `INVALID_EVENT`. The grid limits mirror the CHECK constraints on `events`.
- **Status.** `implemented` (Phase 4 it-1): `create-event-rules.ts`, `backoffice-dto.ts`; tests `create-event-rules.test.ts`, `create-event.route.integration.test.ts`.

### O87. Route-wide admin access test over real routes

- **Context.** The Phase 1 test (O49) enumerates every route under `/api/admin`, and needs an admin 2xx for each. Real routes need bodies and existing ids.
- **Options.** Skip routes that need input; per-route test lists; sample bodies and seeded ids inside the one route-wide test (chosen).
- **Choice.** `admin-access.integration.test.ts` sends a sample body for each mutating route and substitutes a seeded event and a held seat for `:eventId` and `:seatId`, so the admin answer is 2xx. It asserts the exact list of six admin routes, so a new route fails the test until it is listed. Anonymous 401 and buyer 403 `FORBIDDEN_ROLE` are asserted for every route. The admin plugin already runs the CSRF and Origin hooks on every non-GET admin route, so route modules do not repeat them (rule 81).
- **Trade-off.** Adding a route means adding its sample body to the test. That is the point: nothing joins the admin area unreviewed.
- **Status.** `implemented` (Phase 4): `backend/src/presentation/http/admin-access.integration.test.ts`, `admin-plugin.test.ts`.

### O88. Back-office read models are owned raw-SQL readers

- **Context.** The admin lists need joins across catalog and booking tables, with the lazy-expiry rule.
- **Options.** Call catalog and booking query services and merge in memory; add admin queries to those modules; owned readers behind back-office ports (chosen).
- **Choice.** `AdminEventListReader`, `AdminLookupsReader` and `EventTicketsReader` are ports in `backoffice/application/ports/admin-readers.ts`; their Prisma adapters are raw SQL in `backoffice/infrastructure/persistence/`. Read-only; no other module's code is imported.
- **Trade-off.** The SQL rules for lazy expiry and for confirmed bookings are repeated from the catalog and booking readers. A change to those rules must be made in three places. Accepted: the alternatives would widen two hot-path modules for a rare operator screen.
- **Status.** `implemented` (Phase 4 it-2 to it-4): files above; tests `admin-event-list`, `admin-open-tickets` and `admin-bought-tickets` route integration tests, `admin-queries.test.ts`.

### O89. Admin pagination

- **Context.** Plan row "Pagination": `page`, `pageSize` max 100.
- **Options.** Cursor pagination; offset pagination with a bounded window (chosen).
- **Choice.** `page` 1 to 100000, `pageSize` 1 to 100; default page size 20 for events and 50 for tickets. Unknown query parameters are 400. `total` comes from a separate count statement; `totalPages` is derived. Every list has a total order, so pages do not overlap.
- **Trade-off.** Offset reads get slower at deep pages; the 100,000 bound and a 20,000-seat cap per event keep it small.
- **Status.** `implemented`: `application/page.ts`, `admin-read-dto.ts`; tests in the three list route tests.

### O90. Event list counts

- **Context.** The event list shows sold, held and available seats per event.
- **Options.** Count per event in a loop; one query over all events; one grouped query for the events on the page (chosen).
- **Choice.** The page is chosen first (newest start first, then id); one grouped query over `seats` for those event ids returns `sold` (status sold), `held` (`held_until > now`) and `available` (available, or a hold whose `held_until <= now`). `now` is one read of the `Clock`, bound as a parameter. Events with no seat rows count zero.
- **Trade-off.** Two statements per request (count and page). The counts are consistent with the seat map and the search (lazy expiry).
- **Status.** `implemented` (Phase 4 it-2): `prisma-admin-event-list-reader.ts`; test `admin-event-list.route.integration.test.ts`.

### O91. Open tickets

- **Context.** The plan lists available and live-held seats, with expired holds counted as available.
- **Options.** Filter in SQL to available and live holds only; list every seat that is not sold and mark its state (chosen).
- **Choice.** Open tickets are the seats with `status <> 'sold'`. `state` is `held` only while `held_until > now`; otherwise `available`. A `releasable` flag is true while the seat row is still `held` in the database, even when the hold has expired, so an operator can clear it (O101). Order: row label length, then label (`COLLATE "C"`), then seat number, so AA follows Z.
- **Trade-off.** A seat in a stale hold appears as available and releasable at once; the label is explained in the UI.
- **Status.** `implemented` (Phase 4 it-3, `releasable` after review): `prisma-event-tickets-reader.ts`; test `admin-open-tickets.route.integration.test.ts`.

### O92. Bought tickets order

- **Context.** The plan says bought tickets are ordered by booking time.
- **Choice.** `bookings.created_at`, then seat order (row length, label, number), then ticket id. A small deviation from the plan: the seat order makes a multi-seat booking read in seat order, and the ticket id makes the order total so pages are stable.
- **Options.** Booking time alone (tickets of one booking share a time, so the order inside a booking would be undefined and pages could repeat rows).
- **Trade-off.** None beyond the deviation. Only confirmed bookings are listed.
- **Status.** `implemented` (Phase 4 it-4): `prisma-event-tickets-reader.ts`; test `admin-bought-tickets.route.integration.test.ts`.

### O93. What the ticket lists expose, and the venue timezone

- **Context.** Buyer emails are personal data; the lists must show times the operator can read.
- **Choice.** Both ticket lists return an event header (`eventId`, `showTitle`, `startsAt`, `venueName`, `city`, `timezone`). They never select ticket codes or payments, and exclude rejected bookings. Buyer email (user email or guest email) and `buyerType` appear only in admin responses. The event list rows and the headers carry the venue timezone, so the UI shows venue time. The frontend found that the first version returned UTC instants without a zone; fixed in `1d1051a`.
- **Options.** Format times on the server; return the zone and format in the browser (chosen).
- **Trade-off.** Every admin sees buyer and guest emails; a log of who looked is not built (O98).
- **Status.** `implemented`: `admin-read-dto.ts`, readers; tests `admin-queries.test.ts`, route integration tests.

### O94. Lookups are capped at 500

- **Context.** The create form needs shows and venues.
- **Choice.** `GET /api/admin/lookups` returns at most 500 shows and 500 venues, ordered by title or name. Beyond that the form needs a search box (not built).
- **Options.** Paginate the lookups; add search now; cap (chosen).
- **Trade-off.** An operator cannot pick the 501st show; they can still type a new one. The demo catalog has 200 shows.
- **Status.** `implemented`: `application/get-lookups-query.ts` (`LOOKUP_LIMIT`), `prisma-admin-lookups-reader.ts`.

### O95. The Phase 1 placeholder `/api/admin/ping` is removed

- **Context.** O49 kept `GET /api/admin/ping` as a placeholder until real admin routes existed.
- **Choice.** Removed in `3ef6b34`. The access test (O87) enumerates the six real routes; release guide checks use `GET /api/admin/lookups`. O49 is updated and marked.
- **Options.** Keep the ping; remove it (chosen).
- **Trade-off.** Nothing outside the repository calls it.
- **Status.** `implemented`: `admin-ping.route.ts` deleted; `admin-access.integration.test.ts`.

### O96. Manual release of a held seat (the proposed operator capability)

- **Context.** Brief: propose one capability an operator needs. A buyer on a phone call abandons checkout, and the seat stays held until the hold expires. A hold whose time has passed can also leave its seat row `held` until the next buyer or the sweeper touches it.
- **Options.** Do nothing and wait for expiry; an admin update of the hold; a conditional release with a reason (chosen).
- **Choice.** `POST /api/admin/events/:eventId/seats/:seatId/release` with `{ reason }`. One conditional statement in one transaction: a CTE selects the seat `FOR UPDATE WHERE status = 'held' AND event_id = $event`, then the `UPDATE` frees it. Zero rows is decided by a read: 404 `SEAT_NOT_FOUND` when the seat is not in the event, 409 `SEAT_NOT_HELD` when it is available or sold. A second release answers 409: the operation is not idempotent, so a double click is visible instead of silent. The answer is `no-store`.
- **Trade-off.** The buyer whose seat is released finds it missing from their hold on their next action. No notification is sent.
- **Status.** `implemented` (Phase 4 it-6): `prisma-seat-releaser.ts`, `release-held-seat-service.ts`, `release-held-seat.route.ts`; tests `prisma-seat-releaser.integration.test.ts`, `release-held-seat.route.integration.test.ts`, `release-held-seat-service.test.ts`.

### O97. Where the releaser lives

- **Context.** The release changes booking-owned rows (`seats`, `holds`).
- **Options.** A booking public command; a back-office raw-SQL `SeatReleaser` over booking tables (chosen).
- **Choice.** `PrismaSeatReleaser` is owned by the back office. Booking's release takes a buyer `Holder` and runs on its hot-path transaction port; widening that for a rare action was judged worse.
- **Trade-off.** Two booking invariants are repeated: a held seat becomes available (hold and expiry cleared) and a hold with no seats left is marked released. Alternative if the coupling hurts: a booking-side operator command.
- **Status.** `implemented` (Phase 4 it-6): `prisma-seat-releaser.ts` and its integration test.

### O98. `seat_release_log` audit table

- **Context.** A manual release changes what a buyer holds; it needs a record of who and why. Earlier text said the admin audit log is not built.
- **Options.** Log line only; a general admin audit log; one table for this action, written in the same transaction (chosen).
- **Choice.** Migration `20261127120000_seat_release_log` (additive): `seat_id`, `event_id`, `hold_id` (nullable), `admin_user_id`, `reason`, `created_at`; foreign keys `ON DELETE RESTRICT`; CHECK reason length 3 to 500; no timestamp default (the application passes the `Clock` value). Rows are kept, one per manual release; no purge job.
- **Trade-off.** This narrows the earlier "audit: not built" to every action except this one. A general admin audit log (every admin action, reads of buyer emails) stays a production addition. RESTRICT keys mean a user, seat or hold with a log row cannot be deleted by accident.
- **Status.** `implemented` (Phase 4 it-6): `backend/prisma/migrations/20261127120000_seat_release_log/migration.sql`; test `prisma-seat-releaser.integration.test.ts`.

### O99. Release reason handling

- **Context.** The reason is free text typed by an operator.
- **Choice.** Trimmed, then 3 to 500 characters (domain rule `parseReleaseReason`, 400 `INVALID_RELEASE_REASON`; the message never carries the text). Stored, never logged: the route logs seat, event and admin ids only. The admin id comes from the session, never the body. Unknown body fields are 400. Ajv coerces scalar types, so a numeric `reason` arrives as a digit string and is accepted as such.
- **Options.** Reject non-strings strictly (would need disabling coercion for one route); accept the coercion (chosen).
- **Trade-off.** `reason: 12345` becomes `"12345"`; harmless, and the 3 character minimum still applies.
- **Status.** `implemented`: `release-rules.ts`, `release-dto.ts`; tests `release-rules.test.ts`, `release-held-seat.route.integration.test.ts`.

### O100. Releasing the last seat of a hold

- **Context.** A hold can own up to the seat cap.
- **Choice.** Mirrors the buyer's release: when the released seat was the hold's last, the hold becomes `released`; a hold with seats left stays `active` with its expiry.
- **Options.** Leave the hold active until it expires; mark it released (chosen).
- **Trade-off.** Same statement-level rule as O97 repeats here.
- **Status.** `implemented`: `prisma-seat-releaser.ts`; test `prisma-seat-releaser.integration.test.ts`.

### O101. Stale holds can be cleared

- **Context.** The review found that an expired hold whose seat row is still `held` showed as available but had no Release button, so an operator could not clear it.
- **Choice.** Open tickets carry `releasable` (O91). The UI shows "Release" for a live hold and "Clear stale hold" for an expired one, with an explanation in the modal. Both post the same request.
- **Options.** Wait for the sweeper or the next buyer; show the button only on live holds; flag stale holds (chosen).
- **Trade-off.** One more field in the API and a second label.
- **Status.** `implemented` (after review): reader, `admin-read-dto.ts`, `tickets-tabs.tsx`, `release-modal.tsx`; tests `admin-open-tickets.route.integration.test.ts`, `event-detail.test.tsx`.

### O102. Total and items are not one snapshot

- **Context.** Each list runs a count and a page as separate statements.
- **Choice.** Accepted: under concurrent writes the total and the items can differ by a row, the same limit as O70. The pager tolerates it.
- **Options.** One repeatable-read transaction; accept (chosen).
- **Trade-off.** An operator may see a total off by one for a moment.
- **Status.** `implemented` (accepted limit): the three readers.

### O102a. Buyer emails never reach the logs

- **Context.** Bought-ticket responses carry buyer emails; review asked whether request logging could leak them.
- **Choice.** No change needed: the logger serializers record method, path without the query string, host, IP and redacted headers, and the status code and headers of the response. Bodies are never logged. A regression test pins it.
- **Options.** Redact in the route; rely on the serializers (chosen).
- **Trade-off.** A future change that logs bodies would break the test, not the code review.
- **Status.** `implemented` (after review): `backend/src/infrastructure/logging/logger-options.ts`; test `backend/src/presentation/http/log-redaction.test.ts`.

### O103. Frontend: start time input

- **Context.** `startsAt` is an instant; operators think in venue time.
- **Choice.** The input is the browser's local `datetime-local` value, converted to an ISO instant on submit. When the venue timezone is known, a "Venue time: ..." preview shows the same instant in the venue's zone.
- **Options.** Typed text with a zone; a picker in venue time; browser-local plus preview (chosen).
- **Trade-off.** An operator in another zone than the venue must read the preview. Venue-zone entry would need a timezone-aware picker.
- **Status.** `implemented` (Phase 4 it-5): `lib/event-form.ts`, `schedule-grid-fields.tsx`; test `create-event-validation.test.tsx`.

### O104. Frontend: price in major units

- **Choice.** The operator enters a price in major units ("45.50"), converted to `priceMinor` with the currency's own decimals (JPY 0, EUR 2). The client bounds mirror the backend (0 to 1,000,000 minor, grid, dates).
- **Options.** Ask for minor units; convert (chosen).
- **Trade-off.** The bounds exist in two places; the server stays authoritative.
- **Status.** `implemented`: `lib/event-form.ts`; test `create-event-validation.test.tsx`.

### O105. Frontend: server messages

- **Choice.** `ApiError.detail` carries the server `error.message`. Only the create-event form shows it, and only for a 400 (messages name a field and a bound, never a value). 409 `VENUE_CONFLICT` shows a fixed message (O84).
- **Options.** Show every server message; show none; show it only where the operator can act (chosen).
- **Trade-off.** Other screens keep generic text.
- **Status.** `implemented`: `shared/lib/api-client.ts`, `use-create-event-form.ts`; tests `api-client-post.test.ts`, `create-event-page.test.tsx`.

### O106. Frontend: timezone field

- **Choice.** A text input with a `datalist` of common zones, validated with `Intl.DateTimeFormat`, as the backend does (O86).
- **Options.** A select of every IANA zone; free text; text with suggestions (chosen).
- **Trade-off.** The datalist is a short list; any valid zone can be typed.
- **Status.** `implemented`: `lib/timezones.ts`, `show-venue-fields.tsx`.

### O107. Frontend: buyers on `/admin`

- **Choice.** A signed-in buyer on `/admin` sees the existing "Not allowed" page (O55) and the page makes no admin API call. The guard is UX only; the server answers 403 (O49).
- **Options.** Redirect to home; "Not allowed" page (chosen).
- **Trade-off.** None new.
- **Status.** `implemented`: `routes.tsx`; test `guards.test.tsx`.

### O108. Frontend: event detail counts

- **Choice.** The detail header shows no seat counts, because there is no per-event admin route for them. Each tab shows its own total (open seats, tickets sold).
- **Options.** Add a per-event route; reuse the event list row; no counts (chosen).
- **Trade-off.** The counts are on the event list only.
- **Status.** `implemented`: `admin-event-detail-page.tsx`, `tickets-tabs.tsx`; test `event-detail.test.tsx`.

### O109. Frontend: "Back office" link

- **Choice.** The user menu shows a "Back office" link for admins only. Hiding the link is UX; access is O49.
- **Options.** Always show; admins only (chosen).
- **Trade-off.** None new.
- **Status.** `implemented`: `auth/components/user-menu.tsx`; test `user-menu.test.tsx`.

---

### O110. External review of Phase 4

- **Context.** Reviewer `SH-cursor` ran the review-suite over the Phase 4 commits (`2ea51e6..HEAD`) outside the run that built them, as for Phase 2 (O68) and Phase 3 (O82), as one single-agent review per round.
- **Findings, round 1.** 0 Critical, 3 Important, 5 suggestions. Important: a new venue with an existing name and city but another country or timezone silently reused the old venue (fixed in `7f45614`, now 409 `VENUE_CONFLICT`, O84); an expired hold whose seat row was still `held` could not be released from the UI (fixed in `7f45614` and `db5f832`, `releasable` and "Clear stale hold", O101); no Phase 4 release guide and O49 still named the removed ping route (fixed in `0d01f94`, O95). Suggestions: the release route was missing from the CSRF guard list (fixed, `mutating-routes-guard.test.ts`); the seat release writes booking tables from backoffice (accepted, O97); the count and the page are not one snapshot (accepted, O102); buyer emails in logs (checked, no body or query is logged, a test pins it, O102a); the plan statuses lagged (updated in `70ba664`).
- **Findings, round 2** (`1d1051a..HEAD`). 0 Critical, 0 Important, confirmed every round 1 item resolved or explicitly accepted; two suggestions: this record, and the Phase 1 plan still listing the ping route (both fixed).
- **Choice.** Fix every finding and record each accepted one with its entry (chosen) over fixing only Critical and Important findings.
- **Trade-off.** The seat release coupling (O97) and the non-snapshot lists (O102) remain by choice. The review was static plus targeted unit runs; the integration and manual browser checks are not part of it.
- **Status.** `implemented` for the fixes (commits above, tests as listed in O84, O101 and O102a).

### O111. Cache headers today, and the cache layer that is not built

- **Context.** D3 writes the caching policy. The phase 5 plan asks the entry to say what exists. This entry records what each route sends today, read from the route files, and what is missing.
- **Options.** Build an edge cache now (CloudFront is not part of the repository and the brief says production is designed, not deployed, O3); an in-process cache (breaks statelessness); only headers, with the policy written (chosen).
- **Choice.** No cache layer is built. The backend sets `Cache-Control` per route:
  - `public, max-age=1`: `GET /api/shows` (`shows-search.route.ts`), `GET /api/events/:eventId` (`event-detail.route.ts`), `GET /api/events/:eventId/seats` (`seat-map.route.ts`; it reads no cookie and sets none, so it is the same for every viewer).
  - `public, max-age=60`: `GET /api/shows/facets` (`shows-facets.route.ts`).
  - `no-store`: `GET /api/events/:eventId/hold`, `PUT .../hold/seats/:seatId`, `DELETE` on the seat release, `POST .../hold/checkout`, `GET /api/auth/csrf`, `GET /api/me/bookings` (with `Vary: Cookie`), `POST /api/guest/exchange`, `GET /api/guest/booking` (with `Vary: Cookie`), and every `/api/admin` route (events list, lookups, open tickets, bought tickets, create event, release).
  - `GET /api/auth/me` also sends `no-store` with `Vary: Cookie` (`me.route.ts`), for the anonymous `{ user: null }` answer and the signed-in answer, as D3 requires.
  - **No `Cache-Control` header at all** on `POST /api/guest/resend` and the other auth POST routes (`request-code`, `verify`, `logout`, `logout-all`). Responses to POST are not cached by browsers or shared caches by default, so this is left as is.
  - The shorter 1 s of the headers against the 30 s, 60 s and 5 min of D3 is deliberate: the edge TTL is the planned cache time, and a browser cache must not stack a long second delay on top of it (O70).
  - Invalidation: nothing to invalidate yet. An admin event create (O83) inserts a new event and the search, facets and detail answers show it within their TTL; with an edge cache the plan is a CloudFront invalidation of `/api/shows*` after create. A price change does not exist (no route edits an event, O67), so there is no price invalidation to build.
  - Never cached, as D3: holds, `held_by_me`, checkout, payments, sessions, My bookings, guest pages, admin responses. The seat map carries no `held_by_me`; the viewer's own hold comes from the uncached `GET .../hold` (D3).
- **Trade-off.** Without a cache layer every poll of the seat map reaches the database (O113); the headers only make the browser and a future edge cache correct.
- **Status.** `implemented` for the headers (files above; tests `shows-facets.route.integration.test.ts`, `event-detail.route.integration.test.ts`, `seat-map.route.integration.test.ts`, `current-hold.route.integration.test.ts`, `checkout.route.integration.test.ts`, `my-bookings.route.integration.test.ts`, `release-seat.route.integration.test.ts`, `hold-seat.route.integration.test.ts` (successful `PUT` hold answers `no-store`), `guest-exchange.route.integration.test.ts`, the admin route integration tests, and `auth-csrf-routes.test.ts`, and `auth-session-routes.integration.test.ts` for `/api/auth/me`). `planned` (Phase 5 it-3, written only) for the cache layer and the invalidation.

### O112. Latency targets, the hold path counted, and the threats

- **Context.** The brief wants written latency targets. The phase 5 plan counted "about four round trips" for the hold; this entry replaces that with a count from the code.
- **Targets (written, not measured).** `GET /api/shows` p95 under 150 ms server time at seed size (200 shows, 200 events, 40,000 seats, O9); seat hold (`PUT .../hold/seats/:seatId`) p95 under 50 ms; checkout p95 under 200 ms excluding the payment provider. No load test or timing run exists in the repository. The optional measurement of the plan (a short `autocannon` run) needs a new dependency, so it needs approval and is not done. The only timing in the repository is the local 20,000-seat insert, about 0.4 to 0.5 s (O85).
- **The hold path, counted.** `HoldSeatService.hold` (`backend/src/modules/booking/application/hold-seat-service.ts`) and `PrismaHoldTransaction` (`prisma-hold-repository.ts`) run these round trips to the database, each in order:
  1. `SELECT clock_timestamp()` (`DatabaseClock`, outside the transaction).
  2. `BEGIN` (Prisma interactive transaction).
  3. `expireStaleHold`: one `UPDATE holds ... RETURNING` (plus one more `UPDATE seats` only when the holder had a stale active hold).
  4. `getOrCreateActiveHold`: `INSERT INTO holds ... ON CONFLICT DO NOTHING`.
  5. `findActiveHold`: `SELECT ... FOR UPDATE` on the holder's active hold.
  6. `findActiveHold`: `SELECT count(*)` of the hold's seats (the second statement exists because of the seat-cap race, D1).
  7. `tryHoldSeat`: the conditional seat `UPDATE ... RETURNING`.
  8. `seatIdsOfHold`: `SELECT id FROM seats WHERE hold_id = ...`.
  9. `COMMIT`.
  So 6 statements inside the transaction and 9 round trips for an anonymous holder (the `vid` cookie is hashed in the application, no query). A signed-in holder adds the session lookup of `requireAuth` or `optionalAuth` (one query, O44), so 10; a visitor with a `vid` cookie who has just signed in adds the adoption transaction once (O60). The plan's "about four" was wrong: four is the number of application steps, not round trips. The 50 ms budget leaves roughly 5 ms per round trip, which is realistic only inside one availability zone. Reductions that are possible and not built: read the clock inside the transaction as its first statement (saves one round trip and a pooled connection checkout), fold the `count` into the `FOR UPDATE` select by locking first in a CTE (the seat-cap test must keep passing, D1), and return the seat ids from the seat UPDATE's own result. Each needs a measurement first.
- **Threats.**
  - Hot seat rows at on-sale: concurrent holds on one seat serialize on that row's lock; correct by D1, and the 100-parallel-holds test shows one winner, but latency of the losers grows with the queue. Mitigation: per-buyer limits and the waiting room (O113).
  - The same holder's parallel clicks serialize on the hold row (`FOR UPDATE`), by design.
  - Polling load: the frontend polls the seat map every `VITE_SEAT_POLL_INTERVAL_MS` (default 3000) while the tab is visible (`frontend/src/features/event/hooks/event-queries.ts`); each answer reads every seat of the event (`prisma-seat-map-reader.ts`, up to 20,000 rows). That is read load on the writer today (O113).
  - Connection pool exhaustion: each hold holds one pooled connection for the 9 round trips; `DATABASE_POOL_MAX` is 10 per instance (O31) and the transaction `maxWait` is 10 s (O66). Instances times the pool size must stay under RDS Proxy and PostgreSQL limits; RDS Proxy shares a database connection between clients only while it is not pinned, and some statements (the `SAVEPOINT` of the adoption transaction is one candidate) can pin it; this was not checked against a proxy. Not measured.
  - Full-text plans: at 40,000 seats the planner prefers sequential scans, and the `OR` between the text match and the venue `ILIKE` cannot use the GIN index (O70). A `UNION` of the two matches is the written fix. The seat-count join for a result page uses `seats(event_id, status)`.
  - Checkout: two clock reads, the mock payment (the mock gateway has no artificial delay) and one confirm transaction (D4). The 200 ms budget excludes the real provider.
- **Indexes that serve these paths (all `implemented`).** Hold and release: `seats_event_id_row_label_seat_number_key` and the primary key for `UPDATE ... WHERE id AND event_id`, `seats_hold_id_idx` for `WHERE hold_id`, the partial unique indexes `holds_event_id_user_id_active_key` and `holds_event_id_visitor_hash_active_key` (migration `20261126130000_booking_schema`) for the get-or-create and the `FOR UPDATE` select, `holds_event_id_idx`. Seat map and counts: `seats_event_id_status_idx`. Search: `shows_search_vector_idx` (GIN), `shows_type_idx`, `shows_genre_idx`, `events_starts_at_idx`, `events_show_id_idx`, `events_venue_id_idx`, `venues_country_code_city_idx` (migrations `20261126130000_booking_schema` and `20261127100000_shows_search`). My bookings: `bookings_user_id_created_at_idx`, `tickets_booking_id_idx`. Sessions: `sessions_token_hash_key` (migration `20261126120000_auth_schema`). The one known missing index is the sweeper's `seats(held_until) WHERE status = 'held'` (O64).
- **Options.** Targets only; targets with a measurement now (needs a dependency and time, not approved); targets with the real count and a list of reductions (chosen).
- **Trade-off.** The numbers are goals, not measurements; a reader cannot tell from this repository whether 50 ms holds. The round trip count is exact for the code today and changes when the reductions are built.
- **Status.** `planned` for the targets and the measurement (Phase 5 it-3; the measurement is optional). `implemented` for the indexes and for the hold path as counted (files above; tests D1, D2). The count was read from the code, not from a trace.

### O113. Scale: 100,000 visitors for 20,000 seats on AWS

- **Context.** The brief asks what breaks first at 100,000 visitors for 20,000 seats and what changes. The Scale section above is the short form; this entry gives the reasoning against the code. Nothing here is built or deployed (O3).
- **What breaks first, in order.**
  1. The seat-hold write path. Every successful hold is 6 statements in one transaction on the single writer (O112). All 20,000 seats of an event are one event's rows; a popular seat is one row lock. At on-sale thousands of visitors click within seconds, so the pool (10 connections per instance) and the lock queues on hot rows run out before CPU does.
  2. Seat-map polling. With the default 3 s poll, 100,000 open pages mean about 33,000 requests per second, each reading up to 20,000 seat rows from the writer (`prisma-seat-map-reader.ts`) and sending them as JSON. This would exhaust the database before the hold path is stressed. Today the `max-age=1` header lets a browser reuse an answer, but there is no shared cache (O111).
  3. The per-request session lookup for signed-in users (`sessions_token_hash_key`, one indexed query per request, plus the role read for admin routes). Cheap but on every request, on the writer.
  4. Search and facets: indexed, and the facets and count queries are small, but they compete with the writer; the `OR` plan (O70) gets worse as the catalog grows.
- **What would change.**
  - A virtual waiting room at CloudFront (a queue token checked at the edge) so only as many buyers enter the on-sale as the hold path serves. Not designed in detail; needs its own plan.
  - Seat availability cached at CloudFront for 1 to 2 seconds (D3). This removes most of the polling: the origin sees about one request per edge location per TTL per event instead of tens of thousands per second. The per-viewer hold stays uncached and small (`GET .../hold`, O111).
  - A read replica (Aurora) for search, facets, event detail and the seat map; the hold path, checkout and sessions stay on the writer. Replica lag makes the seat map stale by that lag, which the 409-and-refresh flow already tolerates (D3).
  - RDS Proxy for connection pooling, with short transactions only (O66); ECS Fargate auto scaling on CPU and request count, with `DATABASE_POOL_MAX` sized so instances times pool stays under the proxy limit (O31).
  - Per-buyer hold limits: the seat cap per hold exists (`MAX_SEATS_PER_HOLD`, 10, D1); a limit on hold attempts per buyer per minute does not, and belongs to the WAF rate rules and a database-backed counter (rule 40).
  - Sessions in ElastiCache (Redis): **needs approval** (a new store the project has not approved); today sessions stay in PostgreSQL, and the session lookup is one indexed query. The alternative with no new service is to leave them on the writer and rely on RDS Proxy.
  - The hold sweeper (O64) scheduled by EventBridge Scheduler as a one-off ECS task.
- **AWS services (from the production table in `.claude/rules/01-project-foundation.md`).** CloudFront (static frontend and edge cache, `/api/*` routed to the ALB), WAF (rate rules), S3 (static frontend), ALB, ECS Fargate with auto scaling, Aurora PostgreSQL 17 with a read replica, RDS Proxy, SES, Secrets Manager or SSM Parameter Store, CloudWatch, EventBridge Scheduler. ElastiCache is the only addition and it is marked as needing approval.
- **Options.** Scale the writer up only (one box: simple, hits the lock ceiling on hot seats anyway); shard events across databases (not needed at one event of 20,000 seats, and the code has no event-to-shard routing); a queue in front of holds (an event bus is not allowed without demonstrated need, rule 01); the list above (chosen).
- **Trade-off.** Seat availability up to 2 s stale at the edge, and a 409 on a click for a seat that was just taken. A waiting room adds a step for buyers and an extra component. No load test supports any figure here; the 33,000 requests per second is arithmetic from the default poll interval, not a measurement.
- **Status.** `planned` (Phase 5 it-3, written only). What exists and keeps the path open: stateless instances, database clock, the conditional hold update and its 100-parallel test (D1), the uncached viewer-hold route split from the public seat map (D3), the pool setting (O31).

### O114. Own KPI: hold-to-purchase conversion and hold expiry rate per event

- **Context.** The brief asks for one KPI chosen by the team, with how it would be computed. The default KPI was recorded in Phase 5 it-0 and implemented as a written decision here; no person has confirmed or replaced it. If the owner prefers another KPI, replace it in this entry.
- **Choice.** Two linked ratios per event, computed from the `holds` table over settled holds:
  - A hold is settled when its outcome is final: `holds.status` is `converted` (checkout succeeded, set in `checkout-statements.ts`), `expired` (the hold transaction, the sweeper or a failed confirm marked it, `prisma-hold-repository.ts`, `prisma-hold-sweeper.ts`, `prisma-checkout-repository.ts`), `released` (the buyer released the last seat, or an operator released it, O98 to O100), or `active` with `expires_at <= now` (lazy expiry, D2: the row has not been touched or swept yet, and counts as expired).
  - Conversion rate = converted / settled. Expiry rate = expired / settled. The rest is released. A live hold (`active` and `expires_at > now`) is not yet counted.
  - Why it is the KPI: it shows whether the 10-minute window (`HOLD_DURATION_MINUTES`) and the checkout are workable (a low conversion with a high expiry rate means buyers run out of time or abandon at payment), and a high expiry rate with few distinct holders signals hoarding. A late-payment rejection (D4) ends as an expired hold with a `rejected` booking, so it is counted as expired and can be split out with `bookings.status = 'rejected'`.
- **Columns (checked against `backend/prisma/schema.prisma` and the booking migration).** `holds.id`, `holds.event_id`, `holds.status` (CHECK in `active`, `converted`, `expired`, `released`), `holds.expires_at`, `holds.created_at`; `bookings.hold_id`, `bookings.status` (`confirmed`, `rejected`); `seats.hold_id` for seats per hold. `now` is the database clock value read once and passed in, as everywhere (O4).
- **Example (read-only; `$1` is the database time, `$2` the start of the window).**
  ```sql
  SELECT h.event_id,
         count(*)                                                        AS settled_holds,
         count(*) FILTER (WHERE h.status = 'converted')                  AS converted,
         count(*) FILTER (WHERE h.status = 'expired'
                             OR (h.status = 'active' AND h.expires_at <= $1)) AS expired,
         count(*) FILTER (WHERE h.status = 'released')                   AS released,
         round(100.0 * count(*) FILTER (WHERE h.status = 'converted') / count(*), 1) AS conversion_pct,
         round(100.0 * count(*) FILTER (WHERE h.status = 'expired'
                             OR (h.status = 'active' AND h.expires_at <= $1)) / count(*), 1) AS expiry_pct
  FROM holds h
  WHERE h.created_at >= $2
    AND (h.status <> 'active' OR h.expires_at <= $1)
  GROUP BY h.event_id
  ORDER BY settled_holds DESC;
  ```
  The `GROUP BY` on `event_id` is served by `holds_event_id_idx`; the `created_at` filter has no index, which is fine at seed size and would run on the read replica at scale (O113).
- **Options considered.** p99 time from the seat click to `held_by_me` (needs request timing the repository does not record); QR fetch success rate (needs a ticket-view counter, and tickets are only fetched by their owners); seat-turnover per event (sold seats over seats; a business measure, not a product-quality one). The chosen pair needs no new column or table.
- **Trade-off.** The ratios are per hold, not per seat or per buyer: a hold with 10 seats counts once, and one buyer's repeated holds count each time. Holds are only rows for successful seat clicks (a failed click rolls its hold back, D1), so clicks that lost to a 409 are not in the denominator. Operator releases count as `released` (they are also in `seat_release_log`). No endpoint, dashboard or scheduled query exists.
- **Status.** `implemented` as a written decision (default recorded in Phase 5 it-0, definition written in it-3; no person has confirmed it). The data it needs `implemented`: the `holds` table and its status transitions (D1, D2, D4, O64, O98). The SQL was not run against a database in this step; it uses only columns that exist in the schema.

### O115. External review of Phase 5

- **Context.** Reviewer `SH-cursor` ran the review-suite over the Phase 5 commits outside the run that built them, as for Phase 4 (O110), as one single-agent review per round.
- **Findings, round 1** (`origin/main..HEAD`, 4 commits). 0 Critical, 3 Important: a stale sentence in O52 about the ping page; the workflow log said "documents only" while scripts and the `/me` fix were in the branch; a log claim that O52 was corrected. Suggestions (5): O19 had a duplicate status, O111 lacked a hold test, the `seed:catalog` hash, plan wording and statuses, and the scope of the install static check. All fixed in `60d1bbe`. The first delegation ended `uncertain` (another input reached the reviewer); the report was obtained with a follow-up request.
- **Findings, round 2** (`206d131..HEAD`). 0 Critical, 1 Important (the KPI it-0 wording in the KPI table and O114) and 3 suggestions (a log sentence about the plan wording, the README status line, this record). All fixed in the fix commit of this round.
- **Choice.** Fix every finding (chosen) over fixing only Critical and Important findings.
- **Trade-off.** The review was static. The timed clean-Mac install run and the browser end-to-end check are not covered by it.
- **Status.** `implemented` (fixes in the commits above; checks by the documentation tests and `node scripts/sync-ai-rules.mjs --check`).

## Back-office capability proposal

**Manual release of a held seat.** An operator can free a seat stuck in a hold with a required reason (for example, a buyer abandoned checkout during a support call, or a hold blocks the last seat before showtime). It uses the same conditional update as a buyer release and writes a log row.

- **Status.** `implemented`: proposed here and built in Phase 4 it-6; the decisions are O96 to O101 (why, the statement, the log table, the reason handling, stale holds).

---

## Scope and cuts

- **Priority order.** Auth foundation, booking core, end-to-end buyer and guest flow, back office, deliverables, design-system depth. If time runs out, cuts go from the last phase backwards.
- **Out of scope.** Real payments, real email delivery, cloud deployment, mobile apps, multi-language UI (brief section 7); general admission; multiple price tiers.
- **Time budget.** About 5.5 hours: Phase 0 0.75 h, Phase 1 0.75 h, Phase 2 1 h, Phase 3 1.25 h, Phase 4 0.5 h, Phase 5 0.75 h, Phase 6 0.5 h. Iterations are review units for AI-driven work, not hours each.
- **Cut candidates, in order.** Phase 6 beyond the base theme; manual seat release (Phase 4 it-6); guest link resend (Phase 3, keep exchange); search facets endpoint (hard-coded filter values instead); multi-architecture image build in CI (amd64 only).
- **Cut so far.** Nothing.

---

## AI workflow

The dated, per-phase record is [`docs/ai-workflow-log.md`](docs/ai-workflow-log.md); this section is the summary the submission asks for. Every commit id below is from `git log` of this repository.

### How Claude is set up

- **Tool and rules.** Claude Code does the building. The engineering rules (governance and approval before code changes, test first, modular monolith with thin routes and shared hooks, locking model, security, AWS production invariants, commits) are the source files in `.cursor/rules/`. `scripts/sync-ai-rules.mjs` generates `.claude/rules/*.md` from them, and `npm run lint` fails when the generated copies drift (`scripts/sync-ai-rules.test.mjs`). The same script generates the skills (feature planning, use case, repository, Fastify route and security, verify, release guide, the review skills, install skill) and the review agents of the local `review-suite` plugin (code reviewer, Bugbot contract reviewer, security, performance, test, type, comment, silent-failure and over-engineering reviewers).
- **What is committed.** `CLAUDE.md`, `AGENT.md`, `.claude/settings.json` and the `install-seathold` skill are tracked; `.cursor/` and `.claude/rules/` are gitignored and exist only in local checkouts (O15), and the other skills and the plugin are not tracked either. A reviewer of the repository sees the rules in summary through `CLAUDE.md`, not the full files. The sync check therefore runs only where `.cursor/` exists.
- **Plans first.** Every phase has a plan in `plans/` (`plans/seatholder_product_roadmap.plan.md` and `plans/phase_<n>_*.plan.md`) with test-first iterations, an "Agreed decisions" table and a matching `DECISIONS.md` entry for every row. A plan was reviewed before code started (example 2 below).
- **Test first, one commit per step.** Each iteration was briefed to a Claude Sonnet subagent as a self-contained step (task, files, the test and the behavior it proves, the done-when command, the rules), with the failing run requested before the implementation. Haiku subagents staged and committed, one step per commit (commit messages name the phase and iteration, for example `feat(booking): add hold and release services with conditional seat update (phase 2 it-3)`, `dbfaa06`).
- **Reports are data.** The main agent re-read the code and re-ran the checks (`npm run verify-fast-part` while iterating, the full `npm run verify` before a push) instead of trusting a subagent's report; a failing step got at most two fix rounds (`.claude/rules/17-common-agents.md`).
- **Unattended runs.** The `am-feature-impl` skill (Agent Manager) runs a plan iteration with no human in the loop: feature branch, test-first steps delegated to subagents and committed one by one, a private PostgreSQL per run, full verify, a review through a fallback chain or delegated to a named Agent Manager agent, a fix round, a release guide in `docs/release_guides/`, plan and roadmap statuses, push and merge request. Starting it counts as the approval the governance rule asks for, for that scope only; a new dependency, a destructive migration, a CI or Docker change or a design question stops the affected step and becomes a blocker in the report.
- **Decisions as one record.** Every design choice and trade-off goes into this file in the same change as the code, with a status (`planned` or `implemented`) and the files and tests that prove it.

### How the output was reviewed

1. **Per step.** The main agent checked each subagent report against the code and a fresh verify run before the commit.
2. **External review, two rounds per phase.** For phases 2, 3 and 4 another Agent Manager agent (reviewer `SH-cursor` named for phases 3 and 4) ran the `review-suite` over the phase, outside the run that built it. Round 1 found 0 Critical findings in each phase and 3, 5 and 3 Important findings for phases 2, 3 and 4; a second round checked the fixes. Every finding was fixed or recorded with its reason as accepted or dropped. The records are O68 (Phase 2), O82 (Phase 3) and O110 (Phase 4); the fix commits are `7b7f11e`, `2afe774`, `82fcf8d`, `2f2bc18`, `7f45614` and `db5f832`.
3. **Plan review in another AI tool** before code (example 2 below) and a review of the roadmap from an AWS point of view (example 1).
4. **Limits of the review.** The Phase 4 review was static plus targeted unit runs; no review replaced a manual browser run of the buyer, guest and admin paths, and the log says where red runs were not captured.

### Where Claude was wrong, and how it was caught

1. **Hold expiry on the host clock (design).** Claude's first plan compared `held_until` with the application's clock. Asking Claude to review the roadmap from an AWS production point of view exposed the flaw: with several backend instances, a host clock running ahead could treat a valid hold as expired and give the seat to someone else. The design changed to database time in production with a controlled clock in tests (O4), and a review check now flags host time where instances must agree.

2. **Plans that disagreed with each other (planning).** A separate review of the plans in another AI tool found that the roadmap, the Phase 2 plan and this file stated the lock predicate differently (`<` against `<=` at the expiry instant), named three different clock sources, described a personalized seat response as edge-cacheable, and capped events at 2,500 seats while the scale answer assumed 20,000. Each was reconciled to one wording (D1, D2, D3, O4, O17), and the missing cases it raised (login with a visitor hold, parallel first clicks of one holder, a test that fires the ticket backstop) became decisions and tests.

3. **The guest link exchange was not atomic (Phase 3, code).**
   - *What Claude produced.* The exchange service (`b7254e2`, routes `d2f62a9`) consumed the one-time link with a conditional `UPDATE`, then read the booking, then created the guest session. Each step was correct alone, and the unit tests used an in-memory link fake that did not model a failing session insert.
   - *How it was caught.* The external review of Phase 3 (O82, reviewer `SH-cursor`) listed it as Important: a failure after the consume burned the link and left a paid guest with no access and no way to retry. The project's locking model asks for one conditional statement instead of steps that can half-complete, and this flow was three steps.
   - *What changed.* `2afe774` reads the usable link and the booking first, then consumes the link and creates the session in one statement (`WITH consumed AS (UPDATE ... RETURNING) INSERT INTO guest_sessions ... SELECT FROM consumed`), answers from the booking already read, and invalidates a link whose email failed to send. The second review round then found that the in-memory link fake used in unit tests did not roll the consume back when the session insert failed, so the unit test could not have caught the original bug; `5649840` made the fake atomic and added a test (O73, O82).

4. **A venue upsert that silently reused another timezone (Phase 4, code).**
   - *What Claude produced.* Creating an event with a new venue used `INSERT ... ON CONFLICT (name, city) DO UPDATE SET name = EXCLUDED.name` (`8fb72b7`), a no-op update that returned the existing row, so an operator who typed another country or timezone for an existing venue got the old values without any warning.
   - *How it was caught.* The Phase 4 external review (O110, round 1, Important).
   - *What changed.* `7f45614` made it 409 `VENUE_CONFLICT` unless country and timezone match, with tests in `prisma-event-grid-writer.integration.test.ts` and `create-event.route.integration.test.ts`; `db5f832` shows the conflict in the form (O84).

5. **A first booking migration that created one table, found only on a fresh database (Phase 2).** Runs stayed green because they used a database that had been migrated step by step while the file grew. Applying all migrations to an empty database exposed it; the fix landed before `d5610c6` and the rule since is to apply a schema change to a fresh database before trusting green runs (log, Phase 2; O65).

6. **A race in the seat cap and a clock read in the wrong place (Phase 2).** Two parallel clicks of one holder could both read the old seat count (the cap integration test found it, D1); the checkout read the clock before the payment, so a hold that lapsed during authorization was still sold (found in review of the checkout service and fixed test-first, D4).

7. **Subagent reports that did not match reality (Phases 1 and 2).** A subagent reported a passing fast verify that failed on a fresh run (stale allowlist entries in the rule sync check, Phase 1 it-1, `a0746e4`); a commit subagent started the local database container without being asked, so later commit briefs allowed only git commands; several steps reported tests as test-first when the failing run had not been captured (the Phase 1 it-3, it-4 and it-6 tests, the Phase 2 it-5 integration tests, the Phase 4 create-event integration tests). These are listed in the log as process deviations, not hidden.

8. **A plan that miscounted the hold path (Phase 5).** The phase 5 plan, written by Claude, said the hold transaction takes "about four round trips". Reading the code for the latency entry (O112) showed 9 database round trips for an anonymous holder: the clock read, `BEGIN`, six statements and `COMMIT`. The same pass found three stale statements in older entries (the Phase 1 `AdminApi` note, the O17 grid validation status, and `D3` listing `/api/auth/me` as never cached while the route sets no cache header, O111), now corrected. Found by re-reading entries against the code, not by a test.

More detail per phase, including process deviations and open items, is in `docs/ai-workflow-log.md`.
