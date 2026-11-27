---
name: Phase 4 - Back office
overview: "Operator screens and routes inside the /api/admin plugin from Phase 1: create an event with a generated rows x seats grid, list open tickets (available and currently held) per event, and list bought tickets with buyer, time and status. Access control is inherited from the prefix hook, so the route-wide access test covers every new route automatically. Also documents one proposed operator capability: manual release of a held seat."
todos:
  - id: it-0-approvals
    content: Approve the back-office defaults below (no new dependencies)
    status: completed
  - id: it-1-create-event
    content: CreateEventService (new or existing show and venue, grid generation in one transaction) and POST /api/admin/events
    status: completed
  - id: it-2-admin-lists
    content: Admin event list, venues and shows lookups for the form
    status: completed
  - id: it-3-open-tickets
    content: Open tickets per event (available and currently held, lazy expiry applied), paginated
    status: completed
  - id: it-4-bought-tickets
    content: Bought tickets per event with buyer (user or guest email), purchase time and status, paginated
    status: completed
  - id: it-5-admin-screens
    content: /admin screens - event list, create event form, event detail with open and bought tabs
    status: completed
  - id: it-6-manual-release-optional
    content: Optional - manual release of a held seat by an operator (the proposed capability)
    status: completed
  - id: it-7-docs-verify
    content: "Proposed capability written up, README, roadmap status. Manual end-to-end as buyer and admin run by the repository owner in desktop Chrome on 2026-11-27. GitHub Actions passed on main after the merges (owner-confirmed, 2026-11-27). External review in two rounds (O110)."
    status: completed
isProject: false
---

# Phase 4 - Back office

Roadmap: `plans/seatholder_product_roadmap.plan.md`, phase 4. Uses the Phase 1 admin plugin and access test, and the Phase 2 schema.

## 1. Context

The brief requires a role-protected back office: create events with a generated seat grid, see open tickets, see bought tickets, and propose one capability an operator needs. Phase 1 already makes `/api/admin/*` admin-only by construction; this phase adds the routes and screens inside that boundary.

## 2. Agreed decisions

| Topic | Decision |
|---|---|
| Create event input | Existing show or new show (title, type, genre, description); existing venue or new venue (name, city, country, timezone); `startsAt`, `priceMinor`, `currency`, `rows` (1-200), `seatsPerRow` (1-200), at most 20,000 seats per event |
| Grid | Rows labelled A, B, C ... (AA after Z), seats numbered from 1; generated in the same transaction as the event |
| Open tickets | Seats with status `available` plus seats `held` with `held_until > $now` (the operation's clock value); held rows show `held_until`. Expired holds count as available (lazy expiry, same rule as Phase 2) |
| Bought tickets | One row per ticket: seat, buyer email (user email or guest email), booking time, booking status (`confirmed`); no payment details |
| Pagination | `page`, `pageSize` (max 100), ordered by row and seat for open tickets, by booking time for bought tickets |
| Proposed capability | Manual release of a held seat: an operator frees a seat stuck in a hold (for example a buyer who abandoned checkout on a phone call) with a required reason. Documented; built only if time allows (it-6) |
| Audit | Not built; listed as a production addition in `DECISIONS.md` (Phase 1 security entry) |

## 3. Security principles

- Every route lives inside the admin plugin; no route registers its own auth.
- Buyer emails appear only in admin responses; nothing else is exposed (no payment data, no ticket codes in lists).
- Inputs are validated with explicit bounds (grid size, price, dates) to stop oversized or malformed events.
- Mutations keep CSRF and Origin checks.

## 4. Architecture

```text
backend/src/modules/backoffice/
  application/       CreateEventService, ListAdminEventsQuery, ListOpenTicketsQuery, ListBoughtTicketsQuery,
                     ReleaseHeldSeatService (optional)
  presentation/http/ routes registered inside adminPlugin (events, event-open-tickets, event-bought-tickets, lookups)
  index.ts
frontend/src/features/admin/       AdminEventsPage, CreateEventPage, AdminEventDetailPage
```

Back office reads and writes catalog and booking data only through those modules' public APIs (`index.ts`), not their repositories.

## 5. Data model

No new tables. Optional it-6 adds `seat_release_log` (`id`, `seat_id`, `hold_id`, `admin_user_id`, `reason`, `created_at`) if built.

## 6. Key flows

1. **Create event.** Validate -> one transaction: create or reuse show and venue, insert event, bulk insert `rows x seatsPerRow` seats as `available` -> 201 event DTO.
2. **Open tickets.** Seats of the event where `status='available'` or (`status='held'` and `held_until <= $now`, shown as available) or `held` with `held_until > $now` (shown as held with expiry).
3. **Bought tickets.** Tickets join bookings (confirmed) join users -> buyer email from user or `guest_email`.
4. **Manual release (optional).** Conditional `UPDATE seats ... WHERE id=$seat AND status='held'` plus a log row with the reason; the buyer's hold keeps its other seats.
5. **Buyer tries the back office.** Any `/api/admin/*` call -> 403 from the Phase 1 hook; the UI hides the link and `RequireAdmin` redirects.

## 7. Configuration

None new.

## 8. HTTP API

All routes require admin (prefix hook). Mutations need CSRF.

| Route | Notes |
|---|---|
| `GET /api/admin/events` | list with sold, held, available counts |
| `POST /api/admin/events` | create event and grid; 201 / 400 |
| `GET /api/admin/lookups` | shows and venues for the form |
| `GET /api/admin/events/:eventId/open-tickets` | paginated |
| `GET /api/admin/events/:eventId/bought-tickets` | paginated |
| `POST /api/admin/events/:eventId/seats/:seatId/release` | optional it-6; body `{ reason }` |

The Phase 1 placeholder `GET /api/admin/ping` is removed once real routes exist.

## 9. Iterations

- **it-0 Approvals.** Defaults in section 2.
- **it-1 Create event.** Tests first: creates exactly `rows x seatsPerRow` seats with the right labels (including AA after Z); a 100 x 200 grid creates 20,000 seats in one transaction; reuses an existing show and venue; out-of-range grid or negative price is 400; a failure mid-insert leaves no partial event (transaction).
- **it-2 Admin lists.** Tests first: event list counts match seat states with lazy expiry; lookups return shows and venues.
- **it-3 Open tickets.** Tests first (controlled clock): available and live-held seats listed; an expired hold appears as available; sold seats excluded; pagination stable.
- **it-4 Bought tickets.** Tests first: user buyer and guest buyer both show the right email; rejected bookings excluded; ordered by time.
- **it-5 Admin screens.** Component tests first: create form validation and submit; event detail tabs render both lists; buyer redirected away from `/admin`.
- **it-6 Manual release (optional).** Tests first: releases only a held seat; sold seat 409; reason required; log row written.
- **it-7 Docs and verify.** The route-wide access test from Phase 1 now covers every new route (confirm it lists them). Proposed capability written in `DECISIONS.md` (or README) with why an operator needs it. README admin section. Manual check: buyer gets 403, admin creates an event and sees it in search. AI workflow log entry. Full `npm run verify`; roadmap todo.

## 10. Verification summary

- Integration: grid generation, lists with lazy expiry, buyer email mapping.
- Route: inherited 401 / 403 / 2xx access test over all admin routes, CSRF on create.
- Component: create form, detail tabs, guard.
- Manual: create an event as admin, buy a seat as buyer and as guest, see both in bought tickets.

## 11. Out of scope / future

- Sales dashboard, refunds, event cloning, price changes, CSV export.
- Admin audit log for all actions (written as a production addition).
