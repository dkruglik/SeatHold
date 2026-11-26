# Release guide: Phase 2 booking core (catalog, seat holds, expiry, mock checkout)

Branch: `feature/phase-2-booking-core` · MR: not opened yet · Plan: `plans/phase_2_booking_core.plan.md` it-1 to it-7 · Date: 2026-11-26

Deploy order: Phase 1 first, or together with it. This branch is stacked on the unmerged Phase 1 branch (`feature/phase-1-auth-access`, guide [phase-1-auth-access.md](phase-1-auth-access.md), which itself deploys after Phase 0). The booking routes read sessions and the CSRF cookie from Phase 1, and the new migration has foreign keys to the Phase 1 `users` table and uses its `citext` extension. Do every "Before deploy" step of the Phase 1 guide first (secrets, SMTP, migration role); this guide does not repeat them.

Placeholders used below: `<site-origin>` (the public https origin, the same value as `FRONTEND_ORIGIN`), `<event-id>` and `<seat-id>` (UUIDs picked with the SQL in "After deploy", step 3), `<database-url>`, `<db-host>`, `<db-port>`, `<db-name>`, `<db-user>` (the production database connection details, as in the Phase 1 guide). The README has no AWS commands and this repository holds no AWS names, so every AWS-specific step is marked `TODO(operator)`.

## What changes for users

Nothing is visible in the browser yet: Phase 2 is the backend only, and there is no booking UI until Phase 3. The API now serves a catalog of events with seat maps. A visitor or a signed-in user can hold seats for 10 minutes, release them, and pay with a mock payment to receive one ticket code per seat. A seat is never sold twice. A hold that runs out is treated as free on the next read or write, with nothing scheduled in the background (an optional one-off sweep command exists, see section 7).

The booking routes are registered only when auth is configured (the real server always does, through `backend/src/runtime.ts`). All are under `/api`:

| Route | Who |
|---|---|
| `GET /api/events/:eventId/seats` | anyone |
| `PUT /api/events/:eventId/hold/seats/:seatId` | user or visitor; CSRF |
| `DELETE /api/events/:eventId/hold/seats/:seatId` | the holder; CSRF |
| `GET /api/events/:eventId/hold` | the holder |
| `POST /api/events/:eventId/hold/checkout` | the holder; CSRF |

The frontend does not change in this release, so there is no frontend deploy.

Details: `README.md`, section "Booking".

## Before deploy

1. Release Phase 1 first or together (see the header).
2. No new secrets and no new dependencies. Docker and CI are unchanged.
3. Optionally set the three public variables below. Their defaults equal the values this guide recommends, so skipping this step is safe.
4. Apply the migration (see "Migrations") before the new backend starts: the backend does not create tables.

### Environment variables

All variables are read by `backend/src/config/load-config.ts`. A wrong value stops the backend at startup with `Invalid configuration: <VARIABLE> ...`; the message names the variable and never prints its value. There is no production-only rule for these three.

| Variable | Value for production | Where | Required | Notes |
|---|---|---|---|---|
| `HOLD_DURATION_MINUTES` | `10` | production env | no (default `10`) | Positive integer. How long a hold lasts, set at the first seat of a hold. |
| `MAX_SEATS_PER_HOLD` | `10` | production env | no (default `10`) | Positive integer. Most seats one holder can hold per event. |
| `DEFAULT_CURRENCY` | `EUR` | production env | no (default `EUR`) | Exactly three uppercase letters (ISO 4217). Empty, lowercase or longer values stop startup. |

No new secrets. Nothing for the secret store.

Add the public variables to your local `.env` only if you run production-like checks locally; `.env.example` already carries them:

```bash
cat >> .env <<'EOF'
HOLD_DURATION_MINUTES=10
MAX_SEATS_PER_HOLD=10
DEFAULT_CURRENCY=EUR
EOF
```

For production, add the same three lines to the task environment.

### Other requirements

1. The Phase 1 requirements still apply: https on `<site-origin>`, `FRONTEND_ORIGIN` equal to the exact browser origin (every booking mutation checks the `Origin` header), and `/api/*` routed to the backend.
2. TODO(operator): decide how the production catalog is loaded. The `seed` command refuses to run when `APP_ENV=production` (it also creates a well-known admin), so it is not a production path. Until you decide, the production database has no venues, shows or events, and the seat map route has nothing to return.
3. TODO(operator): the mock payment gateway is the only payment adapter. `POST /api/events/:eventId/hold/checkout` takes `paymentOutcome` (`succeed` or `fail`) from the client, so any caller can mark a payment as paid. Do not expose the booking routes to real customers in production until a real payment adapter replaces it, or block `POST /api/events/*/hold/checkout` at the edge. Decide which, and who owns it.
4. The expiry sweeper exists (`backend/src/modules/booking/infrastructure/persistence/prisma-hold-sweeper.ts`) but is not scheduled and not needed for correctness: expiry is lazy. Nothing schedules it in this release; the optional one-off sweep command is in section 7, and correctness does not depend on it.

## Deploy

The deploy path is the one in the Phase 1 guide ("Deploy"): the backend image has no migration path yet, so migrate first, then deploy the backend.

1. Migrate (see "Migrations").
2. Build the backend image from the release commit:

```bash
docker build -f backend/Dockerfile -t seatholder-backend .
```

3. Deploy the image with the environment above. TODO(operator): the backend release command (the README gives no AWS command).

No frontend change: skip the frontend release.

### Migrations

The backend deploy does not apply migrations (DECISIONS.md O35). This release adds one:

| Migration | What it does | Risk |
|---|---|---|
| `20261126130000_booking_schema` | Creates the tables `venues`, `shows`, `events`, `seats`, `holds`, `bookings`, `tickets` and `payments`, their indexes (including `UNIQUE(seat_id)` on `tickets` and two partial unique indexes: one active hold per holder and event), foreign keys (to each other and to `users`), and CHECK constraints on seat status, hold status, holder, booking status, payment outcome and the seat grid size. | Additive only. It creates new tables and does not touch, drop or rewrite any existing table or data. The tables are new and empty, so there are no long locks. The foreign keys reference `users`, so the Phase 1 migration must be applied first. |

**Action:** apply the migration. It creates new tables only. Safe to repeat: Prisma records applied migrations in `_prisma_migrations` and skips them. Run it from a checkout of the release commit, with the database URL taken from the secret store (do not paste it into shared shell history or a file):

```bash
npm ci
export DATABASE_URL='<database-url>'
npm run db:migrate:deploy
unset DATABASE_URL
```

Expected: `All migrations have been successfully applied.` The run lists `20261126130000_booking_schema` (and `20261126120000_auth_schema` too if Phase 1 was not applied yet). If it fails with `relation "users" does not exist`, Phase 1 is not applied: stop and apply it.

TODO(operator): run migrations against the direct database endpoint, not RDS Proxy (see the Phase 1 guide).

Check that it is applied:

```bash
export DATABASE_URL='<database-url>'
npm exec -w backend -- prisma migrate status
unset DATABASE_URL
```

Expected: `Database schema is up to date!`

No manual data steps. The catalog is not loaded by this deploy (see "Other requirements", item 2).

## After deploy: check the feature

Set the shell variables once (placeholders from the header). `EVENT_ID` and `SEAT_ID` come from the SQL in step 3:

```bash
SITE='<site-origin>'
EVENT_ID='<event-id>'
SEAT_ID='<seat-id>'
JAR="$(mktemp)"
```

### 1. The backend started with the new configuration

```bash
curl -s "$SITE/api/health"
echo
```

Expected: `{"status":"ok"}`. If the tasks do not become healthy, read the task log: a line `Invalid configuration: <VARIABLE> ...` names the variable that is wrong. For this release that can be `HOLD_DURATION_MINUTES`, `MAX_SEATS_PER_HOLD` or `DEFAULT_CURRENCY`. Fix it and redeploy. TODO(operator): the log-group name and the command to tail it (the README has no AWS commands). This release adds no new log event names.

### 2. The migration, the tables and stale holds (SQL checks)

Open psql (read-only queries, counts only):

```bash
psql "host=<db-host> port=<db-port> dbname=<db-name> user=<db-user> sslmode=require"
```

```sql
-- The migration is recorded; expected: 1 row, finished true, rolled_back false
SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
FROM _prisma_migrations WHERE migration_name = '20261126130000_booking_schema';

-- The eight tables exist with their row counts; expected: 8 rows. After a deploy with no catalog every count is 0.
-- A local seeded database shows venues=12, shows=200, events=200, seats=40000 and 0 for the rest until someone books.
SELECT 'venues' AS table_name, count(*) AS rows FROM venues
UNION ALL SELECT 'shows', count(*) FROM shows
UNION ALL SELECT 'events', count(*) FROM events
UNION ALL SELECT 'seats', count(*) FROM seats
UNION ALL SELECT 'holds', count(*) FROM holds
UNION ALL SELECT 'bookings', count(*) FROM bookings
UNION ALL SELECT 'tickets', count(*) FROM tickets
UNION ALL SELECT 'payments', count(*) FROM payments;

-- Stale holds: seats still marked held whose time has passed; expected: any number, usually small.
-- Lazy expiry already treats these seats as available (a hold with held_until <= now is free to take),
-- so this count is not a fault and needs no action. It only counts rows the unscheduled sweeper has not tidied.
SELECT count(*) AS stale_held_seats FROM seats WHERE status = 'held' AND held_until <= now();

-- Sold seats and tickets must match; expected: seats_sold = tickets (UNIQUE(seat_id) on tickets backs it)
SELECT (SELECT count(*) FROM seats WHERE status = 'sold') AS seats_sold, (SELECT count(*) FROM tickets) AS tickets;
```

If the first query returns no row, the migration was not applied: go back to "Migrations". If `seats_sold` differs from `tickets`, stop and roll back (see "Rollback"): a seat was sold without a ticket, or the reverse.

### 3. Pick an event and read its seat map

This needs a loaded catalog (see "Other requirements", item 2). In psql, pick the earliest upcoming event that still has a free seat, and one free seat of it:

```sql
-- One event id; expected: 1 row. Copy event_id into EVENT_ID.
SELECT e.id AS event_id, e.starts_at, count(*) FILTER (WHERE s.status = 'available') AS free_seats
FROM events e JOIN seats s ON s.event_id = e.id
WHERE e.starts_at > now()
GROUP BY e.id, e.starts_at
HAVING count(*) FILTER (WHERE s.status = 'available') > 0
ORDER BY e.starts_at
LIMIT 1;

-- One free seat of that same event; expected: 1 row. Copy seat_id into SEAT_ID.
SELECT s.id AS seat_id, s.row_label, s.seat_number
FROM seats s
WHERE s.status = 'available'
  AND s.event_id = (SELECT e.id FROM events e JOIN seats x ON x.event_id = e.id
                    WHERE e.starts_at > now() AND x.status = 'available'
                    GROUP BY e.id, e.starts_at ORDER BY e.starts_at LIMIT 1)
ORDER BY s.row_label, s.seat_number
LIMIT 1;
```

Read the seat map (public, read-only):

```bash
curl -s -i "$SITE/api/events/$EVENT_ID/seats" | head -c 700
echo
curl -s -o /dev/null -w '%{http_code}\n' "$SITE/api/events/00000000-0000-4000-8000-000000000000/seats"
```

Expected: `200`, the header `Cache-Control: public, max-age=1`, and a body shaped `{"event":{"id":"...","priceMinor":...,"currency":"EUR"},"seats":[{"id":"...","row":"...","number":1,"state":"available"},...]}`. The second call must print `404` (code `EVENT_NOT_FOUND`).

### 4. Hold and release a seat

**Action:** holds one seat for the test visitor, then releases it. Safe: it writes one `holds` row (a visitor hash, no personal data) and flips one seat to `held` and back to `available`; the hold would also lapse by itself after `HOLD_DURATION_MINUTES`. It does not pay.

Mutating routes need the `X-CSRF-Token` header and an `Origin` equal to `FRONTEND_ORIGIN` (the CSRF flow from the Phase 1 guide, step 3). The visitor cookie `vid` is kept in the same cookie jar.

```bash
CSRF_TOKEN="$(curl -s -c "$JAR" -b "$JAR" -H "Origin: $SITE" "$SITE/api/auth/csrf" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')"
curl -s -c "$JAR" -b "$JAR" -X PUT -H "Origin: $SITE" -H "X-CSRF-Token: $CSRF_TOKEN" "$SITE/api/events/$EVENT_ID/hold/seats/$SEAT_ID"
echo
curl -s -b "$JAR" "$SITE/api/events/$EVENT_ID/hold"
echo
curl -s -o /dev/null -w '%{http_code}\n' -b "$JAR" -X DELETE -H "Origin: $SITE" -H "X-CSRF-Token: $CSRF_TOKEN" "$SITE/api/events/$EVENT_ID/hold/seats/$SEAT_ID"
curl -s -o /dev/null -w '%{http_code}\n' -b "$JAR" "$SITE/api/events/$EVENT_ID/hold"
rm -f "$JAR"
```

Expected, in order: `{"seatIds":["<seat-id>"],"expiresAt":"..."}` with `expiresAt` about 10 minutes ahead; the same body from the hold read; `204` for the release; then `404` for the hold read (code `HOLD_NOT_FOUND`). The release answer must carry `Cache-Control: no-store`; to check it, repeat the release with headers shown (hold a seat again first):

```bash
curl -si -b "$JAR" -X DELETE -H "Origin: $SITE" -H "X-CSRF-Token: $CSRF_TOKEN" "$SITE/api/events/$EVENT_ID/hold/seats/$SEAT_ID" | grep -i '^cache-control'
```

Expected: `cache-control: no-store`. Other answers: `403` means `Origin` differs from `FRONTEND_ORIGIN` or the token is missing (code `CSRF_INVALID`); `409 SEAT_UNAVAILABLE` means the seat was taken, so pick another seat id. A `404` with an HTML body on every call means `/api/*` is not routed to the backend.

Do not run the checkout route as a smoke test in production: it is the client-controlled mock payment (see "Other requirements", item 3).

### 5. The two proof tests

They need a database, so run them from a checkout of the release commit on a development machine with PostgreSQL running (`npm run db:start`), not against production. The wrapper creates a throwaway database, migrates it, runs the command and drops it:

```bash
node scripts/test-db.mjs run -- npm run test:integration -w backend -- prisma-hold-repository.hold-concurrency
node scripts/test-db.mjs run -- npm run test:integration -w backend -- prisma-hold-repository.kpi-expiry
```

Expected: both finish with all tests passed. The first runs 100 parallel holds on one seat and expects exactly one winner. The second moves a controlled clock past the hold duration and expects the seat to be on sale again, without real waiting.

### 6. Seeding the local catalog (development only)

**Action (local, never production):** `db:seed` also loads the catalog. It refuses with exit code 1 when `APP_ENV=production`.

```bash
npm run db:seed
```

Expected last line on a fresh local database: `catalog inserted venues=12 shows=200 events=200 seats=40000`. A second run prints zeros (`venues=0 shows=0 events=0 seats=0`).

### 7. Sweeping expired holds (optional)

Expiry is lazy, so nothing depends on this. The sweeper only tidies stale `held` rows. **Action:** frees the seats of expired holds and marks those holds `expired`; safe to repeat and to run beside the running app. Run it once as a one-off task from the same image and environment as the API (the same `DATABASE_URL` and configuration as the service), with the image's app directory (`/app`) as the working directory. The production image has no dev dependencies (no `tsx`), so the task runs the compiled script:

```bash
node backend/dist/scripts/sweep-holds.js --batch-size=500
```

The development and local equivalent, which needs the dev dependencies, is `npm run sweep:holds -w backend -- --batch-size=500`; do not use it in the production image.

Expected: one line `holds swept freedSeats=<n> expiredHolds=<n>` and exit code 0 (`0` and `0` when nothing was stale). A batch size outside 1 to 10000, or any other argument, prints the usage and exits with 2. To check the result, the SQL count of stale seats (after step 2's query) should be 0 right after the run:

```sql
SELECT count(*) FROM seats WHERE status = 'held' AND held_until <= now();
```

### Scheduler checks

None. Nothing in this repository schedules the sweeper. TODO(operator): decide whether to run the sweep on a schedule (for example an EventBridge Scheduler target that starts a one-off task from the API image with the command `node backend/dist/scripts/sweep-holds.js --batch-size=500`) or skip it, which is safe because expiry is lazy.

## Rollback

The migration only adds tables, and the previous release does not read them, so it is safe to leave them in place when the application is rolled back. Application rollback: redeploy the previous backend image. The three new variables are ignored by the previous release; leave or remove them. There is no flag to switch booking off: roll back the application. The application builds its routes at startup and now refuses to start when booking is wired without the auth services (`buildApp` throws); a task that exits at once with that message in its log is a wiring mistake in the release, not a database problem, and rolling back the image is the fix.

To also remove the schema (only if nothing needs the data): this deletes every hold, booking, ticket and payment record and the whole catalog, and it cannot be undone. Take a database backup first if any of it matters.

**Action:** drops the eight booking tables and removes the migration record. Run it only after the application rollback, so no instance writes to the tables meanwhile.

```sql
BEGIN;
DROP TABLE IF EXISTS "tickets";
DROP TABLE IF EXISTS "payments";
DROP TABLE IF EXISTS "bookings";
DROP TABLE IF EXISTS "seats";
DROP TABLE IF EXISTS "holds";
DROP TABLE IF EXISTS "events";
DROP TABLE IF EXISTS "shows";
DROP TABLE IF EXISTS "venues";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261126130000_booking_schema';
COMMIT;
```

Expected: `COMMIT`. The Phase 1 tables and accounts are untouched.

## Known limits

- The mock payment takes the outcome from the client and is the only payment adapter (see the TODO(operator) in "Other requirements").
- The production catalog has no loader: the seed is local only (see the TODO(operator) in "Other requirements").
- The sweeper is not scheduled (the one-off command `node backend/dist/scripts/sweep-holds.js` exists). Stale `held` rows stay until a later hold or read treats them as free; correctness does not depend on it.
- No booking UI yet (Phase 3), so nothing in the browser exercises these routes.
- The backend image has no migration path (DECISIONS.md O35), as in Phase 1.
- The GitHub Actions workflow has not run on this branch.
- TODO(operator) lines above: how the production catalog is loaded, how to keep the mock payment away from real customers, the backend release command, the log-group name, and migrating through the direct database endpoint.
- README: "Booking" in `README.md`. Decisions: DECISIONS.md D1, D2, D4, D6 and O58 to O68 (O67 is the checkout price, O68 the external review).
