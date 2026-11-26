---
name: Phase 2 - Booking core
overview: "Catalog and seat schema, deterministic seed data, and the seat hold, release, expiry and confirm logic with its HTTP API. One conditional UPDATE per seat makes overselling impossible, a UNIQUE(seat_id) on tickets backs it up, and expiry is lazy against an injected clock. Proven by two required tests: 100 parallel holds on one seat produce exactly one winner, and a controlled-clock expiry returns the seat to sale with no real waiting."
todos:
  - id: it-0-approvals
    content: Approve the booking defaults below (no new dependencies)
    status: pending
  - id: it-1-catalog-schema-seed
    content: venues, shows, events, seats schema with constraints; deterministic seed (~12 venues, 200 shows, 10x20 grid per event)
    status: pending
  - id: it-2-hold-domain
    content: Hold and seat domain rules, holder identity (user or visitor), errors
    status: pending
  - id: it-3-hold-release-service
    content: Hold-on-click and release services with conditional UPDATE, one timer per hold, seat cap; concurrency test (100 -> 1)
    status: pending
  - id: it-4-expiry
    content: Lazy expiry everywhere a hold or seat is read or written; controlled-clock expiry test; idempotent sweeper query
    status: pending
  - id: it-5-checkout-service
    content: Mock payment port, confirm in one transaction, late payment rejected and voided, double-confirm race test
    status: pending
  - id: it-6-booking-http
    content: Seat map, hold, release, current hold and checkout routes; visitor cookie; CSRF on mutations
    status: pending
  - id: it-7-docs-verify
    content: DECISIONS entries 1, 2, 4, 6; install skill seeds catalog; README; full verify; roadmap status
    status: pending
isProject: false
---

# Phase 2 - Booking core

Roadmap: `plans/seatholder_product_roadmap.plan.md`, phase 2. Uses Phase 1 sessions, CSRF hooks and the `Clock` from Phase 0.

## 1. Context

"A seat can never be sold twice" is the core of the brief. This phase delivers the data model, the locking model, hold expiry and the confirm step, with the two required automated proofs. The buyer UI (Phase 3) and back office (Phase 4) only call into it.

## 2. Agreed decisions

| Topic | Decision |
|---|---|
| Hold model | Hold on click: each click holds that seat immediately and adds it to the holder's single active hold for the event. All seats share the hold's `expires_at`, set when the hold is created |
| Hold duration | `HOLD_DURATION_MINUTES`, default 10 |
| Seat cap | `MAX_SEATS_PER_HOLD`, default 10, checked in the hold service. Per-buyer-per-show limits are out of scope |
| Holder identity | Signed-in user (`user_id`) or anonymous visitor: random 32-byte token in cookie `vid` (`HttpOnly`, `SameSite=Lax`, `Path=/api`), SHA-256 stored as `visitor_hash`. When a session exists, the holder is the user; otherwise the visitor. After login, the next booking request adopts the visitor's active holds into the user (flow 9). Checkout resolves the holder the same way: session first, then visitor |
| Locking | Per seat: `UPDATE seats SET status='held', hold_id=$hold, held_until=$expires WHERE id=$seat AND event_id=$event AND (status='available' OR (status='held' AND held_until <= $now)) RETURNING id`. `$now` is the operation's clock value. Zero rows -> 409 `SEAT_UNAVAILABLE`. No read-then-write |
| Backstop | `UNIQUE(seat_id)` on `tickets`; a violation maps to 409 and rolls back |
| Expiry | Lazy: a held seat with `held_until <= $now` counts as available for every read and write. An idempotent sweeper query exists but nothing depends on it |
| Time | Each operation reads `Clock.now()` once (database time in the app, `ControlledClock` in tests) and passes it as `$now` to every statement, the sweeper included; no SQL statement calls `now()` or `clock_timestamp()` itself, so the expiry tests are deterministic |
| Payment | `PaymentGateway` port; `MockPaymentGateway` returns the outcome the buyer picked (`succeed` / `fail`). Authorization runs outside the database transaction (vendor rule) |
| Confirm | One transaction: `UPDATE seats SET status='sold', held_until=NULL WHERE hold_id=$hold AND status='held' AND held_until > $now RETURNING id`; the row count must equal the hold's seat count, else roll back |
| Late payment | Payment succeeded but the hold expired (or a seat was retaken): booking `rejected`, payment `voided`, 409 `HOLD_EXPIRED` |
| Money | Integer minor units, one currency per event (`EUR` default). The booking copies the unit price |
| Seed | Deterministic (fixed RNG seed): ~12 venues in ~5 countries / 8 cities, 200 shows across types (concert, theatre, sport, stand-up, opera, festival) and genres, one event per show over the next 90 days, each with a 10 x 20 grid (200 seats) |
| Ticket code | 128-bit random, base64url, stored as is with a unique index; it is the QR payload in Phase 3 (unguessable, not enumerable) |
| Grid size | 1-200 rows, 1-200 seats per row, at most 20,000 seats per event (matches the scale scenario) |
| Hold creation race | The holder's hold row is created with `INSERT ... ON CONFLICT DO NOTHING` on the partial unique index, then selected, so parallel first clicks of one holder share one hold |
| Seat map API | Split: the seat route is public and identical for every viewer (edge-cacheable, D3); the viewer's hold (seat ids, `expires_at`) comes from the separate uncached hold route and is merged in the browser |

## 3. Security principles

- Seat state changes only through single conditional statements or the confirm transaction; never through application-side checks.
- A holder can only release or check out their own hold (`user_id` or `visitor_hash` match), else 404.
- Visitor tokens are stored hashed; ticket codes are random, never sequential.
- Payment data is mock only; no card data is accepted or stored.

## 4. Architecture

```text
backend/src/modules/catalog/        venues, shows, events (read models used here; search in Phase 3)
  infrastructure/persistence/, index.ts
backend/src/modules/booking/
  domain/            Hold, SeatState, Money, errors (SeatUnavailable, HoldExpired, HoldLimitReached, HoldNotFound)
  application/       HoldSeatService, ReleaseSeatService, GetSeatMapQuery, GetCurrentHoldQuery,
                     CheckoutService, ports: SeatRepository, HoldRepository, BookingRepository, PaymentGateway, Clock
  infrastructure/    Prisma repositories, MockPaymentGateway, sweeper query
  presentation/http/ routes (seat-map, hold-seat, release-seat, current-hold, checkout), hooks/visitor-identity
  index.ts
backend/src/scripts/seed.ts         extended from Phase 1
```

Extension points: `PaymentGateway` (a real provider later), holder identity (a per-buyer limit later reads the same columns).

## 5. Data model

| Table | Key columns | Constraints |
|---|---|---|
| `venues` | `id`, `name`, `city`, `country_code char(2)`, `timezone` | `UNIQUE(name, city)` |
| `shows` | `id`, `title`, `type text`, `genre text`, `description` | index `(type)`, `(genre)` |
| `events` | `id`, `show_id`, `venue_id`, `starts_at timestamptz`, `price_minor int`, `currency char(3)`, `rows int`, `seats_per_row int` | FKs; `CHECK (price_minor >= 0)`; `CHECK (rows BETWEEN 1 AND 200 AND seats_per_row BETWEEN 1 AND 200 AND rows * seats_per_row <= 20000)`; index `(starts_at)` |
| `seats` | `id`, `event_id`, `row_label`, `seat_number`, `status text`, `hold_id`, `held_until` | `UNIQUE(event_id, row_label, seat_number)`; `CHECK (status IN ('available','held','sold'))`; `CHECK ((status='held') = (hold_id IS NOT NULL AND held_until IS NOT NULL))`; index `(event_id, status)`, `(hold_id)` |
| `holds` | `id`, `event_id`, `user_id`, `visitor_hash`, `expires_at`, `status text`, `created_at` | `CHECK (status IN ('active','converted','expired','released'))`; `CHECK (num_nonnulls(user_id, visitor_hash) = 1)`; partial unique `(event_id, user_id) WHERE status='active'` and `(event_id, visitor_hash) WHERE status='active'` |
| `bookings` | `id`, `hold_id`, `event_id`, `user_id`, `guest_email citext`, `status text`, `unit_price_minor`, `total_minor`, `currency`, `created_at` | `UNIQUE(hold_id)`; `CHECK (status IN ('confirmed','rejected'))`; `CHECK (status <> 'confirmed' OR num_nonnulls(user_id, guest_email) = 1)`; index `(user_id, created_at DESC)`, `(guest_email)` |
| `tickets` | `id`, `booking_id`, `seat_id`, `code`, `created_at` | `UNIQUE(seat_id)`; `UNIQUE(code)` |
| `payments` | `id`, `hold_id`, `idempotency_key`, `amount_minor`, `outcome text`, `created_at` | `UNIQUE(idempotency_key)`; `CHECK (outcome IN ('succeeded','failed','voided'))` |

Growth: 200 seats per event; `holds` and `payments` grow per attempt (purge of old expired holds noted for later).

## 6. Key flows

1. **Hold seat.** In one transaction: mark the holder's stale active hold for the event `expired` (if `expires_at <= $now`) and free its seats; get or create the active hold with `INSERT ... ON CONFLICT DO NOTHING` then select it (`expires_at = $now + HOLD_DURATION_MINUTES`); reject at the seat cap (409 `HOLD_LIMIT_REACHED`); run the conditional seat UPDATE; zero rows -> 409 `SEAT_UNAVAILABLE` (the hold row is kept only if it already had seats).
2. **Release seat.** `UPDATE seats SET status='available', hold_id=NULL, held_until=NULL WHERE id=$seat AND hold_id=$myHold AND status='held'`; an empty hold becomes `released`.
3. **Seat map.** Public and identical for every viewer: each seat `available` (including expired holds), `held` or `sold`. The viewer's own hold comes from the separate hold route (seat ids, `expires_at`); the client marks those seats `held_by_me` and runs the countdown.
4. **Checkout.** Load the active hold of the holder (404 if none, 409 `HOLD_EXPIRED` if expired) -> authorize the mock payment outside the transaction with an idempotency key -> failed: record `failed`, hold unchanged, 402 `PAYMENT_FAILED` -> succeeded: confirm transaction (seats sold, booking `confirmed`, tickets with codes, hold `converted`, payment `succeeded`) -> row count mismatch: roll back, booking `rejected`, payment `voided`, 409 `HOLD_EXPIRED`.
5. **Race: 100 holders, one seat.** The conditional UPDATE serializes on the row lock; exactly one gets the row.
6. **Race: double checkout of one hold.** The second confirm finds no `held` rows for the hold (or hits `UNIQUE(hold_id)`), so one booking only.
7. **Late payment.** Clock passes `expires_at`, another holder takes a seat, the first payment succeeds -> confirm finds fewer rows -> rejected and voided.
8. **Sweeper (optional).** `UPDATE seats ... WHERE status='held' AND held_until <= $now` in bounded batches, `$now` from the `Clock`; safe on any number of instances.
9. **Login with an active visitor hold.** On the next booking request carrying both a session and `vid`, one transaction moves each active visitor hold to the user (`user_id` set, `visitor_hash` cleared), unless the user already has an active hold for that event; then the visitor hold's seats are released. `vid` is cleared afterwards.

## 7. Configuration

| Variable | Default | Secret |
|---|---|---|
| `HOLD_DURATION_MINUTES` | `10` | no |
| `MAX_SEATS_PER_HOLD` | `10` | no |
| `DEFAULT_CURRENCY` | `EUR` | no |

## 8. HTTP API

| Route | Auth | CSRF | Notes |
|---|---|---|---|
| `GET /api/events/:eventId/seats` | none | - | public seat states (`available`, `held`, `sold`), identical for every viewer, cacheable 1-2 s |
| `PUT /api/events/:eventId/hold/seats/:seatId` | user or visitor (cookie issued if missing) | yes | 200 hold DTO / 409 |
| `DELETE /api/events/:eventId/hold/seats/:seatId` | holder | yes | 204 |
| `GET /api/events/:eventId/hold` | holder | - | current hold (seat ids, `expires_at`) or 404; never cached |
| `POST /api/events/:eventId/hold/checkout` | holder | yes | body `{ paymentOutcome, guestEmail? }`; `guestEmail` required without a session; 201 booking / 402 / 409 |

Guest link delivery after a guest checkout is added in Phase 3.

## 9. Iterations

- **it-0 Approvals.** Defaults in section 2. No new dependencies.
- **it-1 Catalog schema and seed.** Integration tests first: seat grid uniqueness; seat status CHECKs reject `held` without `hold_id`; seed is idempotent and produces 200 shows with 200 seats per event.
- **it-2 Hold domain.** Unit tests first: public seat state (`available`, `held`, `sold`; an expired hold counts as `available`), with no knowledge of the viewer; holder identity accepts exactly one of user or visitor; money totals in minor units.
- **it-3 Hold and release.** Integration tests first (real Postgres, `scripts/test-db.mjs`): **100 parallel `HoldSeatService` calls from 100 different visitors on one seat produce exactly 1 success and 99 `SEAT_UNAVAILABLE`, and the seat row points at the winner's hold**; a sold seat cannot be held; two parallel first clicks by one holder on two seats create one hold holding both; the seat cap returns `HOLD_LIMIT_REACHED`; a second seat joins the same hold and keeps its `expires_at`; release frees only the holder's seat.
- **it-4 Expiry.** Integration tests first with `ControlledClock`: **after `HOLD_DURATION_MINUTES` plus 1 second, another visitor can hold the seat, and the same run gives the same result every time (no real waiting)**; at exactly `expires_at - 1s` the seat is still held; the seat map shows expired holds as available; the sweeper query, given the controlled `$now`, frees only expired seats and is idempotent.
- **it-5 Checkout.** Tests first: success sells all seats and creates tickets with unique codes; payment `fail` leaves the hold intact; late payment (clock past expiry, seat retaken) is `rejected` with payment `voided`; two concurrent checkouts of one hold create one booking; a forced second ticket for a sold seat is rejected by `UNIQUE(seat_id)` and the confirm maps it to 409 with a full rollback (backstop test); a guest checkout without email is a 400.
- **it-6 Booking HTTP.** Route tests first: visitor cookie issued on first hold; the public seat route returns the same body for two different viewers; a visitor hold is adopted after login and checks out as the user; adoption when the user already holds seats for the event releases the visitor's seats; another visitor cannot release or check out my hold (404); CSRF enforced on the three mutations; error codes map to 402 / 409 with stable `code` fields.
- **it-7 Docs and verify.** `DECISIONS.md` entries 1 (locking and concurrency), 2 (hold state and expiry), 4 (late payment), 6 (data store and the guarantees relied on: row locks, READ COMMITTED, unique constraints), each matching the code. Install skill runs the seed. README booking section. AI workflow log entry. Full `npm run verify`; roadmap todo.

## 10. Verification summary

- Unit: public seat state (no viewer), holder identity, money.
- Integration: the two required KPI tests, seat cap, release, late payment, double checkout, sweeper idempotency, constraints.
- Route: holder ownership, CSRF, error mapping.
- Manual: hold seats in two browsers, watch one lose the race, let a hold expire with a short `HOLD_DURATION_MINUTES`, pay with success and failure.

## 11. Out of scope / future

- Per-buyer-per-show limits and hold extension (natural live changes).
- Real payment provider and refunds.
- General admission, multiple price tiers.
- Scheduled sweeper wiring (EventBridge in production).
