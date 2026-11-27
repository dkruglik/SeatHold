# Release guide: Phase 4 back office (events, tickets, manual seat release)

Branch: `feature/phase-4-back-office` · MR: not opened yet · Plan: `plans/phase_4_back_office.plan.md` it-1 to it-7 · Date: 2026-11-27

Deploy order: Phase 3 first (and the Phase 1 and Phase 2 steps it depends on). Do their "Before deploy" steps if they are not done on the target environment (guides [phase-1-auth-access.md](phase-1-auth-access.md), [phase-2-booking-core.md](phase-2-booking-core.md) and [phase-3-buyer-flow.md](phase-3-buyer-flow.md)); this guide does not repeat them. The new migration adds a table with foreign keys to `seats`, `events`, `holds` and `users`, all created by earlier phases.

Placeholders used below: `<site-origin>` (the public https origin, the same value as `FRONTEND_ORIGIN`), `<admin-email>` (a mailbox you can read, which becomes the admin), `<buyer-email>` (a second mailbox you can read, which stays a buyer), `<event-id>` and `<seat-id>` (UUIDs picked with the SQL in "After deploy"), `<database-url>`, `<db-host>`, `<db-port>`, `<db-name>`, `<db-user>` (the production database connection details, as in the Phase 1 guide). The README has no AWS commands and this repository holds no AWS names, so every AWS-specific step is marked `deferred to deploy (not deployed by this project)`.

## What changes for users

Admins get a back office at `/admin` (a "Back office" link appears in the user menu for admins only). An admin can create an event from an existing or a new show and venue, with a generated seat grid of up to 20,000 seats; list every event with its sold, held and available seats; list the open tickets and the bought tickets (buyer email, user or guest, and booking time) of one event; and release a held seat with a required reason. Buyers and visitors see no change, except that a seat an operator released can be held again at once.

Nothing is switched by a flag. The new routes are all under `/api/admin`: anonymous callers get 401 and buyers get 403. The Phase 1 placeholder `GET /api/admin/ping` is gone; use `GET /api/admin/lookups` for access checks. No admin exists after deploy until an operator creates one (see "After deploy", step 3).

Details: `README.md`, section "Admin back office". Decisions: `DECISIONS.md` O83 to O109.

## Before deploy

1. Release Phases 1 to 3 first if they are not live (see the header).
2. No environment variables and no secrets change (see below).
3. Apply the migration (see "Migrations") before the new backend starts: the backend does not create tables.

### Environment variables

None. This release adds no variable and changes no default (`.env.example` and the config module are untouched). No new secrets. Nothing for the secret store.

### Other requirements

1. Everything is under `/api`, so the existing `/api/*` CloudFront behaviour to the load balancer covers the six admin routes. Every admin answer carries `Cache-Control: no-store` because it can hold buyer emails. deferred to deploy (not deployed by this project): confirm the CloudFront cache policy for `/api/admin/*` does not cache and still forwards the `Cookie`, `Origin` and `X-CSRF-Token` headers (the repository holds no CloudFront configuration).
2. The frontend gets new paths under `/admin` (the event list, a create form and an event page). A reload on any of them must serve `index.html` (see the Phase 3 guide, "Other requirements", item 2).
3. deferred to deploy (not deployed by this project): decide who is the first admin and make sure that person can receive the login email (see "After deploy", step 3). The seed is refused in production, so there is no default admin.
4. The backend and the frontend must be released together: the new screens need the new routes.

## Deploy

The backend image has no migration path (DECISIONS.md O35), as in earlier phases. Order: migrate, then deploy the backend, then the frontend.

1. Migrate (see "Migrations").
2. Build the backend image from the release commit:

```bash
docker build -f backend/Dockerfile -t seatholder-backend .
```

3. Deploy the image. deferred to deploy (not deployed by this project): the backend release command (the README gives no AWS commands).
4. Build the frontend. It adds no dependency and no build variable:

```bash
npm ci
npm run build -w frontend
```

Then publish `frontend/dist` behind CloudFront. deferred to deploy (not deployed by this project): the frontend upload and CloudFront invalidation commands (the README gives none).

### Migrations

This release adds one migration. It is additive: one new table, and no existing table, column or row is changed.

| Migration | What it does | Risk |
|---|---|---|
| `20261127120000_seat_release_log` | Creates `seat_release_log` (`id`, `seat_id`, `event_id`, `hold_id` nullable, `admin_user_id`, `reason`, `created_at`) with two indexes (`seat_id`; `event_id, created_at`), four foreign keys `ON DELETE RESTRICT` (to `seats`, `events`, `holds`, `users`) and a CHECK that `reason` has 3 to 500 characters. `created_at` has no default; the application sets it. | Additive only. The table is new and empty; the foreign keys only take a brief share lock on the referenced tables. |

**Action:** apply the migration. It creates one table. Safe to repeat: Prisma records applied migrations in `_prisma_migrations` and skips them. Run it from a checkout of the release commit, with the database URL taken from the secret store (do not paste it into shared shell history or a file):

```bash
npm ci
export DATABASE_URL='<database-url>'
npm run db:migrate:deploy
unset DATABASE_URL
```

Expected: `All migrations have been successfully applied.` and the list names `20261127120000_seat_release_log`. If it fails with `relation "holds" does not exist` or a similar message, an earlier phase is not applied: stop and apply it.

deferred to deploy (not deployed by this project): run migrations against the direct database endpoint, not RDS Proxy (see the Phase 1 guide).

Check that it is applied:

```bash
export DATABASE_URL='<database-url>'
npm exec -w backend -- prisma migrate status
unset DATABASE_URL
```

Expected: `Database schema is up to date!`

No manual data steps. The first admin is created in "After deploy", step 3.

## After deploy: check the feature

Set the shell variables once (placeholders from the header):

```bash
SITE='<site-origin>'
ADMIN_JAR="$(mktemp)"
BUYER_JAR="$(mktemp)"
```

### 1. The backend started

```bash
curl -s "$SITE/api/health"
echo
```

Expected: `{"status":"ok"}`. No variable is new, so a startup failure here is not about this release: read the task log for `Invalid configuration: <VARIABLE> ...`. deferred to deploy (not deployed by this project): the log-group name and the command to tail it (the README has no AWS commands).

### 2. The migration and the new table (SQL checks)

Open psql (read-only queries, counts only):

```bash
psql "host=<db-host> port=<db-port> dbname=<db-name> user=<db-user> sslmode=require"
```

```sql
-- The migration is recorded; expected: 1 row, finished true, rolled_back false
SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
FROM _prisma_migrations
WHERE migration_name = '20261127120000_seat_release_log';

-- The table exists and the reason check is in place; expected: 1 row each
SELECT count(*) AS table_present FROM information_schema.tables WHERE table_name = 'seat_release_log';
SELECT conname FROM pg_constraint WHERE conname = 'seat_release_log_reason_check';

-- Rows so far; expected: 0 right after the deploy
SELECT count(*) AS releases FROM seat_release_log;
```

### 3. Create the first admin and prove access control

**Action:** logs in as two test accounts. Each login creates one `users` row (a buyer) if the address is new, and one `sessions` row. Safe: it adds only those rows; both addresses are yours. The limit is 5 code requests per 15 minutes per address.

Log in as `<buyer-email>` and as `<admin-email>` with the same commands as in the Phase 1 guide, steps 3 to 5 ("A CSRF token is issued", "Request a login code", "Log in with the code"): set `JAR="$BUYER_JAR"` and `TEST_EMAIL='<buyer-email>'`, then `JAR="$ADMIN_JAR"` and `TEST_EMAIL='<admin-email>'`. Keep both jars.

**Action:** makes `<admin-email>` an admin. Safe: it changes one `users` row for an address that has already signed in, and `npm run user:demote -- '<admin-email>'` reverses it. Run it as in the Phase 1 guide, step 8 ("Create the first admin"), with the same environment:

```bash
npm run user:promote -- '<admin-email>'
```

Expected: `<admin-email> is now admin` (or `already admin`). deferred to deploy (not deployed by this project): run it from a one-off task in the production network if the database is not reachable from where you run it.

Now the access checks (read-only):

```bash
echo "anonymous:"; curl -s -o /dev/null -w '%{http_code}\n' "$SITE/api/admin/lookups"
echo "buyer:";     curl -s -o /dev/null -w '%{http_code}\n' -b "$BUYER_JAR" "$SITE/api/admin/lookups"
echo "admin:";     curl -s -o /dev/null -w '%{http_code}\n' -b "$ADMIN_JAR" "$SITE/api/admin/lookups"
```

Expected: `401`, `403`, `200`. If the buyer or the anonymous call prints `200`, stop: access control is broken. Roll back (see "Rollback") and report it. The role is read on every request, so the admin jar works without logging in again.

### 4. Create an event and time the 20,000-seat grid

**Action:** creates one show, one venue and one event with 20,000 seats (100 rows of 200). It is a real event that buyers can see (title `Release check`, venue `Release check hall`), so run it only when that is acceptable (see the TODO below). It writes 1 show, 1 venue (or reuses it), 1 event and 20,000 seats in one transaction. The event starts in 30 days.

```bash
CSRF_TOKEN="$(curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -H "Origin: $SITE" "$SITE/api/auth/csrf" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')"
START="$(node -e 'console.log(new Date(Date.now() + 30 * 864e5).toISOString())')"
curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST -H "Origin: $SITE" -H "X-CSRF-Token: $CSRF_TOKEN" -H 'Content-Type: application/json' \
  -w '\nstatus=%{http_code} seconds=%{time_total}\n' \
  -d "{\"show\":{\"new\":{\"title\":\"Release check\",\"type\":\"concert\",\"genre\":\"rock\",\"description\":\"Created by the Phase 4 release check\"}},\"venue\":{\"new\":{\"name\":\"Release check hall\",\"city\":\"Berlin\",\"countryCode\":\"DE\",\"timezone\":\"Europe/Berlin\"}},\"startsAt\":\"$START\",\"priceMinor\":1000,\"currency\":\"EUR\",\"rows\":100,\"seatsPerRow\":200}" \
  "$SITE/api/admin/events"
```

Expected: a body with `"seatCount":20000` and an `eventId`, then `status=201`. Locally the transaction took about 0.4 to 0.5 s; expect a few seconds through the network and database of production. A value near 30 s means the transaction timeout would fail the request; then report it. Possible answers: `403` (the CSRF token or `FRONTEND_ORIGIN` does not match), `400` with code `INVALID_EVENT` (the message names the field), `409` with code `VENUE_CONFLICT` (a venue named `Release check hall` in `Berlin` already exists with another country or time zone).

deferred to deploy (not deployed by this project): no route deletes an event, and seats are referenced by holds, tickets and the release log, so a test event cannot be removed through the application. Decide whether to run this check in production at all, or only against a demo environment; if a test event must be removed, plan a manual database cleanup with a backup first (this guide gives no delete SQL).

Check what the database holds (psql, counts only):

```sql
-- The check event and its seats; expected: seats = 20000, available = 20000, rows = 100, seats_per_row = 200
SELECT e.id AS event_id, e.rows, e.seats_per_row, count(s.id) AS seats,
       count(*) FILTER (WHERE s.status = 'available') AS available
FROM events e JOIN shows sh ON sh.id = e.show_id JOIN seats s ON s.event_id = e.id
WHERE sh.title = 'Release check'
GROUP BY e.id
ORDER BY e.id;

-- Row labels start at A and there are 100 of them; expected: first_label A, labels 100
SELECT min(s.row_label COLLATE "C") AS first_label, count(DISTINCT s.row_label) AS labels
FROM seats s JOIN events e ON e.id = s.event_id JOIN shows sh ON sh.id = e.show_id
WHERE sh.title = 'Release check';
```

Expected (first query): one row with `seats` 20000 (one row per run if you ran the check more than once). Copy `event_id` from the first query into `EVENT_ID` below.

### 5. The lists

Read-only. Set `EVENT_ID` and look at the list, the open tickets and the bought tickets:

```bash
EVENT_ID='<event-id>'
curl -s -b "$ADMIN_JAR" "$SITE/api/admin/events?pageSize=2" | head -c 700
echo
curl -s -b "$ADMIN_JAR" "$SITE/api/admin/events/$EVENT_ID/open-tickets?pageSize=3"
echo
curl -s -b "$ADMIN_JAR" "$SITE/api/admin/events/$EVENT_ID/bought-tickets?pageSize=3"
echo
curl -s -o /dev/null -w '%{http_code}\n' -b "$ADMIN_JAR" "$SITE/api/admin/events?unknown=1"
curl -s -o /dev/null -w '%{http_code}\n' -b "$ADMIN_JAR" "$SITE/api/admin/events?pageSize=101"
```

Expected: the event list is `{"items":[...],"total":...,"page":1,"pageSize":2,"totalPages":...}` where each item has `sold`, `held`, `available`, `seatCount` and a `timezone`. The open tickets show `"event":{...,"timezone":"Europe/Berlin"}` and three seats `A1`, `A2`, `A3` with `"state":"available"`, `"heldUntil":null`, and a `total` of 20000. The bought tickets list has `"total":0` and an empty `items` on a new event. The last two calls print `400`. Ticket codes and payment fields appear in no answer.

### 6. The release flow

Needs a held seat. In a browser, sign in as `<buyer-email>`, open the event page for `<event-id>` (`<site-origin>/events/<event-id>`) and click one seat, but do not pay. Then pick that seat:

```sql
-- One held seat of the event; expected: 1 row. Copy seat_id into SEAT_ID.
SELECT id AS seat_id, row_label, seat_number, held_until
FROM seats WHERE event_id = '<event-id>' AND status = 'held'
ORDER BY held_until DESC LIMIT 1;
```

**Action:** releases that one seat. Safe: it makes one held seat available again, ends the buyer's hold if that was its last seat, and writes one `seat_release_log` row. It cannot be undone, but the buyer can click the seat again.

```bash
SEAT_ID='<seat-id>'
CSRF_TOKEN="$(curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -H "Origin: $SITE" "$SITE/api/auth/csrf" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')"
curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST -H "Origin: $SITE" -H "X-CSRF-Token: $CSRF_TOKEN" -H 'Content-Type: application/json' \
  -d '{"reason":"Phase 4 release check"}' -w '\nstatus=%{http_code}\n' "$SITE/api/admin/events/$EVENT_ID/seats/$SEAT_ID/release"
curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST -H "Origin: $SITE" -H "X-CSRF-Token: $CSRF_TOKEN" -H 'Content-Type: application/json' \
  -d '{"reason":"Phase 4 release check"}' -w '\nstatus=%{http_code}\n' "$SITE/api/admin/events/$EVENT_ID/seats/$SEAT_ID/release"
curl -s -c "$ADMIN_JAR" -b "$ADMIN_JAR" -X POST -H "Origin: $SITE" -H "X-CSRF-Token: $CSRF_TOKEN" -H 'Content-Type: application/json' \
  -d '{"reason":"x"}' -w '\nstatus=%{http_code}\n' "$SITE/api/admin/events/$EVENT_ID/seats/$SEAT_ID/release"
```

Expected: the first call answers `{"seatId":"...","eventId":"...","released":true}` and `status=200`. The second answers `status=409` with code `SEAT_NOT_HELD` (a release is not repeatable). The third answers `status=400` with code `INVALID_RELEASE_REASON` (3 to 500 characters).

Check the log row and the seat (psql, no free text selected):

```sql
-- One log row per release; expected: 1 row for that seat, reason_length 21 (the text above), the admin id is yours
SELECT l.seat_id, l.event_id, l.hold_id IS NOT NULL AS had_hold, char_length(l.reason) AS reason_length,
       l.admin_user_id = (SELECT id FROM users WHERE email = '<admin-email>') AS by_admin, l.created_at
FROM seat_release_log l WHERE l.seat_id = '<seat-id>';

-- The seat is available again; expected: status available, held_until and hold_id empty
SELECT status, held_until IS NULL AS no_expiry, hold_id IS NULL AS no_hold FROM seats WHERE id = '<seat-id>';

-- Counts over the whole table; expected: releases equals the number of manual releases so far
SELECT count(*) AS releases FROM seat_release_log;
```

Then, in the browser as admin, open `<site-origin>/admin`, open the event and look at the "Open tickets" tab: a held seat has a "Release" button; a seat whose hold has run out but whose row is still held shows "Clear stale hold". Both ask for a reason.

### 7. Logs

```bash
# deferred to deploy (not deployed by this project): replace with your log tail command (the README has no AWS commands), then filter:
#   ... | grep 'seat released by operator'
```

Expected: one line per manual release with `seatId`, `eventId` and `adminUserId`, and no reason text (the reason is stored in the database and never logged).

### 8. Clean up the test sessions

**Action:** deletes only the local cookie jars. The test sessions expire by themselves; log out in the browser to end them earlier.

```bash
rm -f "$ADMIN_JAR" "$BUYER_JAR"
```

### Scheduler checks

None. This release adds no background job, queue or schedule.

## Rollback

The migration is additive and the previous release does not read the new table, so it is safe to leave it in place when the application is rolled back. Application rollback: redeploy the previous backend image and the previous frontend build. The previous backend has no `/api/admin/lookups` (it still has `/api/admin/ping`), so a back-office check against it answers 404. No variable needs removing. Events created through the back office stay and are normal events; a seat released by an operator stays released.

Do not drop `seat_release_log`: it is the audit trail of manual releases, nothing else depends on it, and dropping it loses that record for good. If you must remove it, take a database backup first, roll the application back first, and run:

**Action:** drops the table and its migration record. Run it only after the application rollback, so no instance writes to the table meanwhile.

```sql
BEGIN;
DROP TABLE IF EXISTS "seat_release_log";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261127120000_seat_release_log';
COMMIT;
```

Expected: `COMMIT`. Seats, holds, events and users are untouched.

## Known limits

Each item below is also recorded in `DECISIONS.md`.

- The repository owner ran the buyer, guest and admin paths end to end in desktop Chrome on 2026-11-27. Step 6 (the browser part) stays as the operator's smoke test after deploy.
- The GitHub Actions workflow passed on main after the merges (owner-confirmed, 2026-11-27).
- Only the manual seat release has an audit trail (`seat_release_log`). Other admin actions, including creating events and reading buyer emails, are not logged beyond the request log (DECISIONS.md O98). A general admin audit log is a production addition.
- There is no route to edit or delete an event, a show or a venue. A new venue whose name and city exist is reused only when its country and time zone match, otherwise `VENUE_CONFLICT` (O84).
- The create form lists at most 500 shows and 500 venues (O94).
- The list total and the items are separate reads, so under concurrent writes they can differ by a row (O102).
- The manual release is not repeatable (409 on the second call) and does not notify the buyer (O96).
- The back office repeats some booking and catalog SQL rules (lazy expiry, held seats becoming available) in its own readers and releaser (O88, O97).
- There is no rate limit on admin routes beyond the edge. deferred to deploy (not deployed by this project): confirm the WAF rate rules cover `/api/admin/*`.
- The backend image has no migration path (DECISIONS.md O35), as in earlier phases.
- Open deferred-to-deploy lines above: the CloudFront cache policy for `/api/admin/*`, the SPA fallback for `/admin`, who the first admin is, whether to run the 20,000-seat check in production and how to clean up its event, the backend and frontend release commands, the log-group name and tail command, migrating through the direct database endpoint, and WAF rate rules for the admin prefix.
- README: "Admin back office" in `README.md`. Decisions: DECISIONS.md O83 to O109.
