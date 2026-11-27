# Release guide: Phase 3 buyer flow (search, seat map, checkout, tickets, guest links)

Branch: `feature/phase-3-buyer-flow` · MR: not opened yet · Plan: `plans/phase_3_buyer_flow.plan.md` it-0 to it-9 · Date: 2026-11-27

Deploy order: Phase 2 first (it is already in `main`, and so is everything it needs from Phase 1 and Phase 0). Do the Phase 1 and Phase 2 "Before deploy" steps first if they are not done on the target environment (guides [phase-1-auth-access.md](phase-1-auth-access.md) and [phase-2-booking-core.md](phase-2-booking-core.md)); this guide does not repeat them. The new migrations alter `shows` and add foreign keys to `bookings`, both created by Phase 2.

Placeholders used below: `<site-origin>` (the public https origin, the same value as `FRONTEND_ORIGIN`), `<event-id>` (a UUID picked with the SQL in "After deploy", step 3), `<test-email>` (a mailbox you can read), `<unused-email>` (any well-formed address that has made no booking), `<database-url>`, `<db-host>`, `<db-port>`, `<db-name>`, `<db-user>` (the production database connection details, as in the Phase 1 guide). The README has no AWS commands and this repository holds no AWS names, so every AWS-specific step is marked `deferred to deploy (not deployed by this project)`.

## What changes for users

The browser now has a booking UI. A visitor searches shows at `/` (text, type, genre, country, city, venue, date-time range; the filters live in the URL), opens an event at `/events/:eventId`, clicks free seats to hold them, sees a countdown and pays with the mock gateway. A signed-in buyer finds the bookings and their tickets, each with a QR code, at `/bookings`.

A visitor can also buy without signing in: the checkout asks for an email address, and after payment the backend emails a one-time link `<site-origin>/guest/access#t=<token>`. The link opens the tickets once, in a guest session (cookie `gsid`) that lasts until the event starts plus one day. A lost link is replaced with the "Send new links" form on the same page. The email is plain text and goes through the same email provider as the login codes (`EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_*`).

Nothing is switched by a flag. The backend and the frontend must be released together: the new screens need the new routes. Nothing is visible until the catalog is loaded (see "Other requirements", item 3).

Details: `README.md`, sections "Buyer flow" and "Booking".

## Before deploy

1. Release Phase 1 and Phase 2 first if they are not live (see the header).
2. No new secrets. The new variables are all public with safe defaults, so skipping step 3 is safe.
3. Optionally set the variables below.
4. Apply the migrations (see "Migrations") before the new backend starts: the backend does not create tables.

### Environment variables

All backend variables are read by `backend/src/config/load-config.ts`. A wrong value stops the backend at startup with `Invalid configuration: <VARIABLE> must be a positive integer`; the message names the variable and never prints its value. There is no production-only rule for these three.

| Variable | Value for production | Where | Required | Notes |
|---|---|---|---|---|
| `GUEST_LINK_TTL_HOURS` | `168` | production env (backend) | no (default `168`) | Positive integer. How long an emailed guest link can be used. |
| `GUEST_RESEND_LIMIT` | `3` | production env (backend) | no (default `3`) | Positive integer. Resends per email address in the window. |
| `GUEST_RESEND_WINDOW_MINUTES` | `60` | production env (backend) | no (default `60`) | Positive integer. The resend window. |
| `VITE_SEAT_POLL_INTERVAL_MS` | `3000` | frontend build environment | no (default `3000`) | Public, read at build time, not a secret. How often the event page polls the seat map while the tab is visible. |

No new secrets. Nothing for the secret store.

Two existing variables now matter more:

- `FRONTEND_ORIGIN` is embedded in every emailed guest link. It must be the exact public https origin of the site, with no trailing slash and no path. A wrong value sends buyers to a dead link. The backend refuses a non-https or localhost value in production (Phase 0).
- The guest link email uses the Phase 1 email settings: `EMAIL_PROVIDER=smtp`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and `SMTP_PASS` (secret). If they are wrong, login codes fail too. The Phase 1 guide lists them and their `deferred to deploy (not deployed by this project)` items. The difference: a failed login email returns an error to the caller, a failed guest link email does not (see "Known limits").

Add the public variables to your local `.env` only if you run production-like checks locally; `.env.example` already carries them:

```bash
cat >> .env <<'EOF'
GUEST_LINK_TTL_HOURS=168
GUEST_RESEND_LIMIT=3
GUEST_RESEND_WINDOW_MINUTES=60
VITE_SEAT_POLL_INTERVAL_MS=3000
EOF
```

For production, add the three `GUEST_*` lines to the backend task environment and `VITE_SEAT_POLL_INTERVAL_MS` to the environment of the frontend build.

### Other requirements

1. Everything is under `/api`, so the existing `/api/*` CloudFront behaviour to the load balancer covers the seven new routes. No new behaviour is needed. Cache headers the backend sends: `GET /api/shows` and `GET /api/events/:eventId` `public, max-age=1`; `GET /api/shows/facets` `public, max-age=60`; `GET /api/me/bookings` and `GET /api/guest/booking` `no-store` with `Vary: Cookie`; `POST /api/guest/exchange` `no-store`. deferred to deploy (not deployed by this project): confirm the CloudFront cache policy for `/api/*` forwards the `Cookie`, `Origin` and `X-CSRF-Token` headers and honours the origin `Cache-Control` (the repository holds no CloudFront configuration), and does not cache `no-store` answers.
2. The frontend is a single-page app with four new paths: `/`, `/events/:eventId`, `/bookings` and `/guest/access` (plus `/login` and `/admin` from earlier phases). A reload or a pasted link on any of them must serve `index.html`. deferred to deploy (not deployed by this project): confirm the S3 and CloudFront setup returns `index.html` (status 200) for unknown non-`/api` paths, for example through a custom error response. Without it, the emailed guest link shows an error page.
3. The Phase 2 catalog loading is still needed for anything to be visible. For a demo deployment run the one-off `node backend/dist/scripts/seed-catalog.js` once, as described in the [Phase 2 guide](phase-2-booking-core.md), section 6 ("Loading the catalog"). Search, facets and the event page return empty results until the catalog exists. deferred to deploy (not deployed by this project): decide whether this is a demo deployment (load the catalog) or a real one (no loader until the Phase 4 back office), as already asked in the Phase 2 guide.
4. deferred to deploy (not deployed by this project): the mock payment gateway takes the outcome (`succeed` or `fail`) from the client, and now there is a screen that offers it to every visitor. Do not expose the booking UI to real customers until a real payment adapter exists, or block `POST /api/events/*/hold/checkout` at the edge. Decide which, and who owns it (carried from the Phase 2 guide).
5. The guest link email needs a working SES account with the sender domain verified and the account out of the sandbox, otherwise only verified addresses receive links (Phase 1 guide, "Other requirements", item 1). deferred to deploy (not deployed by this project): confirm the SES state before real guests buy.

## Deploy

The backend image has no migration path (DECISIONS.md O35), as in Phases 1 and 2. Order: migrate, then deploy the backend, then the frontend.

1. Migrate (see "Migrations").
2. Build the backend image from the release commit:

```bash
docker build -f backend/Dockerfile -t seatholder-backend .
```

3. Deploy the image with the environment above. deferred to deploy (not deployed by this project): the backend release command (the README gives no AWS commands).
4. Build the frontend. The new dependencies (`qrcode`, `@mantine/dates`, `dayjs`) are bundled into the static build; nothing new runs on a server:

```bash
npm ci
VITE_SEAT_POLL_INTERVAL_MS=3000 npm run build -w frontend
```

Then publish `frontend/dist` behind CloudFront. deferred to deploy (not deployed by this project): the frontend upload and CloudFront invalidation commands (the README gives none).

### Migrations

This release adds two migrations. Both are additive: no existing column or row is changed or dropped, and no data is rewritten.

| Migration | What it does | Risk |
|---|---|---|
| `20261127100000_shows_search` | Adds the stored generated column `shows.search_vector` (`to_tsvector('simple', title)`), a GIN index `shows_search_vector_idx` on it, and a btree index `venues_country_code_city_idx` on `venues(country_code, city)`. | `ADD COLUMN ... GENERATED ALWAYS ... STORED` rewrites the whole `shows` table and holds an exclusive lock on it while it runs. `shows` is small (200 rows in the demo catalog), so this takes well under a second. `CREATE INDEX` (not `CONCURRENTLY`) blocks writes to `shows` and `venues` while each index builds; reads of these tables during the rewrite wait. Both tables are small and written only by the back office, so run it during any quiet minute. |
| `20261127110000_guest_access_schema` | Creates `guest_access_links`, `guest_sessions` and `guest_resend_attempts`, their unique and lookup indexes, and foreign keys from the first two to `bookings(id)`. Only token hashes and the SHA-256 of the lower-cased email are stored, never a token or an address. | Additive only. New empty tables. The foreign keys only reference `bookings`, so no lock beyond a brief share lock on it. |

**Action:** apply the migrations. They create new tables and indexes and add one generated column. Safe to repeat: Prisma records applied migrations in `_prisma_migrations` and skips them. Run it from a checkout of the release commit, with the database URL taken from the secret store (do not paste it into shared shell history or a file):

```bash
npm ci
export DATABASE_URL='<database-url>'
npm run db:migrate:deploy
unset DATABASE_URL
```

Expected: `All migrations have been successfully applied.` The run lists `20261127100000_shows_search` and `20261127110000_guest_access_schema`. If it fails with `relation "bookings" does not exist`, Phase 2 is not applied: stop and apply it.

deferred to deploy (not deployed by this project): run migrations against the direct database endpoint, not RDS Proxy (see the Phase 1 guide).

Check that they are applied:

```bash
export DATABASE_URL='<database-url>'
npm exec -w backend -- prisma migrate status
unset DATABASE_URL
```

Expected: `Database schema is up to date!`

No manual data steps. The catalog is loaded by the Phase 2 command (see "Other requirements", item 3), not by this release.

## After deploy: check the feature

Set the shell variables once (placeholders from the header). `EVENT_ID` comes from the SQL in step 3:

```bash
SITE='<site-origin>'
EVENT_ID='<event-id>'
```

### 1. The backend started with the new configuration

```bash
curl -s "$SITE/api/health"
echo
```

Expected: `{"status":"ok"}`. If the tasks do not become healthy, read the task log: a line `Invalid configuration: <VARIABLE> must be a positive integer` names the wrong variable (`GUEST_LINK_TTL_HOURS`, `GUEST_RESEND_LIMIT` or `GUEST_RESEND_WINDOW_MINUTES` for this release). Fix it and redeploy. deferred to deploy (not deployed by this project): the log-group name and the command to tail it (the README has no AWS commands).

### 2. The migrations and the new tables (SQL checks)

Open psql (read-only queries, counts only):

```bash
psql "host=<db-host> port=<db-port> dbname=<db-name> user=<db-user> sslmode=require"
```

```sql
-- Both migrations are recorded; expected: 2 rows, finished true, rolled_back false
SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
FROM _prisma_migrations
WHERE migration_name IN ('20261127100000_shows_search', '20261127110000_guest_access_schema')
ORDER BY migration_name;

-- The search column and its index exist; expected: 1 row with is_generated 'ALWAYS', and 2 rows for the indexes
SELECT column_name, is_generated FROM information_schema.columns WHERE table_name = 'shows' AND column_name = 'search_vector';
SELECT indexname FROM pg_indexes WHERE indexname IN ('shows_search_vector_idx', 'venues_country_code_city_idx') ORDER BY indexname;

-- The generated column is filled for every show; expected: shows = with_vector (0 and 0 on an empty catalog, 200 and 200 after the demo catalog)
SELECT count(*) AS shows, count(search_vector) AS with_vector FROM shows;

-- The guest tables exist; expected: 3 rows. Right after the deploy all counts are 0; they grow with guest purchases.
SELECT 'guest_access_links' AS table_name, count(*) AS rows FROM guest_access_links
UNION ALL SELECT 'guest_sessions', count(*) FROM guest_sessions
UNION ALL SELECT 'guest_resend_attempts', count(*) FROM guest_resend_attempts;
```

You can also run `\d shows` in psql: expected, a `search_vector` column of type `tsvector` with `generated always as (to_tsvector('simple'::regconfig, title)) stored` and the index `shows_search_vector_idx` using `gin`.

If the first query returns fewer than 2 rows, go back to "Migrations".

### 3. Search, facets and event detail (public, read-only)

Needs a loaded catalog (see "Other requirements", item 3). On an empty catalog every call still answers, with `"items":[]`.

```bash
curl -s -i "$SITE/api/shows?q=a&pageSize=2" | head -c 900
echo
curl -s -i "$SITE/api/shows/facets" | head -c 700
echo
curl -s -o /dev/null -w '%{http_code}\n' "$SITE/api/shows?unknown=1"
```

Expected: `200` for the first two, with `cache-control: public, max-age=1` and `cache-control: public, max-age=60`, bodies shaped `{"items":[...],"total":...,"page":1,"pageSize":2,"totalPages":...}` and `{"types":[...],"genres":[...],...}`. The third call prints `400` (unknown query parameters are refused). A `404` with an HTML body on every call means `/api/*` is not routed to the backend.

In psql, pick an event, then read its detail:

```sql
-- One upcoming event id; expected: 1 row. Copy event_id into EVENT_ID.
SELECT e.id AS event_id, e.starts_at
FROM events e
WHERE e.starts_at > now()
ORDER BY e.starts_at
LIMIT 1;
```

```bash
curl -s -i "$SITE/api/events/$EVENT_ID" | head -c 700
echo
curl -s -o /dev/null -w '%{http_code}\n' "$SITE/api/events/00000000-0000-4000-8000-000000000000"
curl -s -o /dev/null -w '%{http_code}\n' "$SITE/api/events/not-a-uuid"
```

Expected: `200` with `cache-control: public, max-age=1` and show, venue, start and price in the body; then `404` (code `EVENT_NOT_FOUND`); then `400`.

### 4. The authenticated and guest routes refuse anonymous callers

```bash
curl -s -i "$SITE/api/me/bookings" | head -n 12
curl -s -i "$SITE/api/guest/booking" | head -n 12
```

Expected: both `401` with code `UNAUTHENTICATED`. They send `cache-control: no-store` only on success; a `401` carrying a cached copy would be a CloudFront misconfiguration, so check that a repeat call is still `401`.

### 5. The single-page app routes

```bash
for path in / /bookings /guest/access "/events/$EVENT_ID"; do curl -s -o /dev/null -w "$path %{http_code} %{content_type}\n" "$SITE$path"; done
```

Expected: every line `200` and `text/html`. A `403` or `404` on `/bookings` or `/guest/access` means the SPA fallback is missing (see "Other requirements", item 2).

### 6. Manual smoke: signed-in buyer (browser)

The repository owner ran this smoke path in desktop Chrome on 2026-11-27 (buyer, guest and admin paths). It stays as the operator's smoke test after deploy. In production the email goes through SES, so use a mailbox you can read for `<test-email>`; locally the email goes to Mailpit at http://localhost:8025.

**Action:** creates one confirmed booking with the mock payment and one ticket per seat. Safe on a demo deployment; on a real deployment do not run it (see "Other requirements", item 4).

1. Open `<site-origin>/login`, enter `<test-email>`, and enter the six-digit code from the mailbox.
2. Open `<site-origin>/`. Type a word from a show title into the search; the list narrows and the address bar keeps the filter. Reload the page: the filter stays.
3. Open an event. Click two free seats. Expected: both turn to "mine", a countdown starts near 10 minutes, and the other seats refresh about every 3 seconds.
4. In the checkout panel choose the test payment "succeed" and pay. Expected: a confirmation with the ticket codes.
5. Open `<site-origin>/bookings`. Expected: the booking, its two tickets and a QR code each.

### 7. Manual smoke: guest buyer (browser)

**Action:** creates one confirmed booking and one email. Same safety as step 6.

1. In a private window (signed out), open an event and hold one seat.
2. In the checkout panel enter `<test-email>` as the guest address and pay with "succeed". Expected: the confirmation tells you to check your email.
3. Open the mailbox (SES in production, Mailpit locally). Expected: within about a minute, one plain-text message with a link `<site-origin>/guest/access#t=...`.
4. Open the link. Expected: the ticket page shows the booking and QR codes, and the address bar no longer contains `#t=`. Reload the page: the tickets still show (session cookie `gsid`).
5. Open the same email link again in a new private window. Expected: the message "This link was already used" (the exchange answered `410 LINK_USED`).
6. In that window use the "Send new links" form with `<test-email>`. Expected: the message "If we found upcoming bookings for this address, we sent new links.", and a new email arrives. Open its link: the tickets show again.

### 8. The resend limit

The resend route answers `204` for every well-formed address, known or not, and `429` once `GUEST_RESEND_LIMIT` requests were made for one address inside `GUEST_RESEND_WINDOW_MINUTES`. It needs the CSRF token and `Origin`:

**Action:** writes up to four rows to `guest_resend_attempts` (hashes only, no address). `<unused-email>` is an address that has no booking, so no email is sent.

```bash
JAR="$(mktemp)"
CSRF_TOKEN="$(curl -s -c "$JAR" -b "$JAR" -H "Origin: $SITE" "$SITE/api/auth/csrf" | sed -n 's/.*"csrfToken":"\([^"]*\)".*/\1/p')"
for i in 1 2 3 4; do
  curl -s -i -b "$JAR" -X POST -H "Origin: $SITE" -H "X-CSRF-Token: $CSRF_TOKEN" -H 'Content-Type: application/json' \
    -d '{"email":"<unused-email>"}' "$SITE/api/guest/resend" | grep -iE '^HTTP|^retry-after'
done
rm -f "$JAR"
```

Expected with the defaults: three `HTTP/... 204` lines, then `HTTP/... 429` followed by a `retry-after: <seconds>` line. The block above works for any limit: the number of `204` lines equals `GUEST_RESEND_LIMIT`. A `403` means `Origin` differs from `FRONTEND_ORIGIN` or the token is missing.

### 9. Logs to watch: undelivered guest links

When the email provider rejects a guest link email, the booking stays confirmed, the stored link is invalidated, and the backend logs one warning with the booking id and the error name (no address, no token):

```text
guest link email was not sent; the buyer can request a new link
```

This line is the operator signal that a guest has paid and holds no link. The buyer's recovery is the resend form on `/guest/access`. Two related warnings: `undelivered guest link could not be invalidated` (the stale link may still be usable until it expires; it is not delivered to anyone). deferred to deploy (not deployed by this project): create a CloudWatch metric filter and alarm on the line `guest link email was not sent` and decide who is paged (the repository holds no CloudWatch configuration). deferred to deploy (not deployed by this project): the log-group name and the command to search it (the README has no AWS commands).

### SQL checks: guest activity

```sql
-- Guest links by state; expected: counts only. After guest purchases: consumed + invalidated + live = total.
SELECT count(*) AS total,
       count(*) FILTER (WHERE consumed_at IS NOT NULL) AS consumed,
       count(*) FILTER (WHERE invalidated_at IS NOT NULL) AS invalidated,
       count(*) FILTER (WHERE consumed_at IS NULL AND invalidated_at IS NULL AND expires_at > now()) AS live
FROM guest_access_links;

-- Live guest sessions; expected: a small number
SELECT count(*) AS live_sessions FROM guest_sessions WHERE revoked_at IS NULL AND expires_at > now();

-- Table growth, since nothing purges these tables yet (see "Known limits"); expected: small numbers for now
SELECT (SELECT count(*) FROM guest_access_links) AS links, (SELECT count(*) FROM guest_sessions) AS sessions,
       (SELECT count(*) FROM guest_resend_attempts) AS resend_attempts;
```

### Scheduler checks

None. This release adds no background job, queue or schedule. Expiry of holds is still lazy, and nothing purges the guest tables yet (see "Known limits").

## Rollback

Both migrations are additive and the previous release does not read what they add (the generated column and indexes are ignored; the guest tables are not referenced), so it is safe to leave them in place when the application is rolled back. Application rollback: redeploy the previous backend image and the previous frontend build, and remove or leave the four new variables (the previous release ignores them). The previous frontend has no guest page, so guest links already emailed stop working and `/guest/access` shows no tickets; buyers get new links after you roll forward, through the resend form. Paid bookings are untouched.

Do not drop the tables that hold data. `guest_access_links`, `guest_sessions` and `guest_resend_attempts` hold only hashes and are not needed by any other table, but dropping them invalidates every emailed link and every guest session and cannot be undone. Dropping `shows.search_vector` is harmless but also not needed. If you must remove the schema, take a database backup first, roll the application back first, and run:

**Action:** drops the three guest tables, the search column and indexes, and the two migration records. Run it only after the application rollback, so no instance writes to the tables meanwhile.

```sql
BEGIN;
DROP TABLE IF EXISTS "guest_resend_attempts";
DROP TABLE IF EXISTS "guest_sessions";
DROP TABLE IF EXISTS "guest_access_links";
DROP INDEX IF EXISTS "venues_country_code_city_idx";
DROP INDEX IF EXISTS "shows_search_vector_idx";
ALTER TABLE "shows" DROP COLUMN IF EXISTS "search_vector";
DELETE FROM "_prisma_migrations" WHERE migration_name IN ('20261127110000_guest_access_schema', '20261127100000_shows_search');
COMMIT;
```

Expected: `COMMIT`. The Phase 1 and Phase 2 tables, bookings and tickets are untouched.

## Known limits

Each item below is also recorded in `DECISIONS.md`.

- The repository owner ran the manual end-to-end in desktop Chrome on 2026-11-27 (buyer, guest and admin). Steps 6 and 7 stay as the operator's smoke test after deploy. Real phones and other browsers are an accepted limit (not tested).
- The GitHub Actions workflow passed on main after the merges (owner-confirmed, 2026-11-27).
- Search `q` matches whole words of the show title (full-text search) OR a substring of the venue name. The OR branch cannot use the GIN index at larger catalog sizes. The fix is a `UNION` of the two matches; revisit it when `EXPLAIN` regresses (DECISIONS.md O70). Not a concern at 200 shows.
- `guest_access_links`, `guest_sessions` and `guest_resend_attempts` have no retention sweep. Expired, consumed and revoked rows are inert (every read checks time and flags) but stay, and one `guest_resend_attempts` row is written per resend attempt (DECISIONS.md O73, O74). deferred to deploy (not deployed by this project): decide when to purge them, before the tables grow, either with a Phase 4 job or a one-off job from the API image.
- An email send failure leaves the buyer without a link until they use the resend form. The undelivered link is invalidated. Alert on the log line in "After deploy", step 9.
- The mock payment gateway takes the outcome from the client, and the checkout panel offers the choice to every visitor (carried from Phase 2; see "Other requirements", item 4).
- If the browser drops the connection after the guest exchange succeeded but before it stores the `gsid` cookie, the link is consumed and the session exists but the buyer has no cookie. Reloading cannot reuse the link; the resend form is the recovery (DECISIONS.md O82).
- The hold countdown uses the browser clock: the hold response carries an expiry time but no server time, so a wrong device clock shows a wrong countdown. The server still decides when a hold ends.
- The resend limit is per email address, so a third request for one address blocks that address for the window, including a legitimate owner (DECISIONS.md O74). The 429 carries `Retry-After` and `retryAfterSeconds` (the same value for every address, so it reveals nothing).
- The backend image has no migration path (DECISIONS.md O35), as in Phases 1 and 2.
- Phase 2 operator items that are still open: demo or real deployment and the catalog load, the sweeper schedule (expiry is lazy, so it is optional), and migrating through the direct database endpoint (see the Phase 2 guide, "Known limits").
- `deferred to deploy (not deployed by this project)` lines above: the CloudFront cache policy for `/api/*`, the SPA fallback to `index.html`, demo or real deployment and the catalog load, keeping the mock payment away from real customers, the SES state for guest emails, the backend and frontend release commands, the log-group name, an alarm on the undelivered guest link warning, the retention of the guest tables, and migrating through the direct database endpoint.
- README: "Buyer flow" in `README.md`. Decisions: DECISIONS.md D5 and O70 to O82.
