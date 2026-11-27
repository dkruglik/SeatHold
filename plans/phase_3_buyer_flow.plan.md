---
name: Phase 3 - Buyer flow
overview: "The end-to-end flow on a plain UI built on the design-system layer: show search with combinable filters and the DateTimeRangePicker, the SeatMap with hold on click and a countdown, mock payment, My bookings with a QR per ticket for signed-in buyers, and guest checkout that emails a one-time link which is exchanged once for a guest session showing the ticket and QR."
todos:
  - id: it-0-approvals
    content: Approve qrcode (exact pin) and the defaults below
    status: completed
  - id: it-1-search-api
    content: GET /api/shows with type, genre, country, city, venue, text and from-to filters, pagination, indexes; facets endpoint
    status: completed
  - id: it-2-event-detail-bookings-api
    content: Event detail route and GET /api/me/bookings with tickets and codes
    status: completed
  - id: it-3-guest-access
    content: Guest link on guest checkout, single exchange into a guest session, guest booking route, resend that invalidates old links
    status: completed
  - id: it-4-datetime-range-picker
    content: Base theme, plus DateTimeRangePicker v1 (one control, date and time from-to) as an extension of Mantine
    status: completed
  - id: it-5-discovery-screen
    content: Discovery screen with filter bar in URL state, results list and pagination
    status: completed
  - id: it-6-seat-map-hold
    content: SeatMap v1 (SVG, four states), hold on click, release, countdown, polling
    status: completed
  - id: it-7-checkout-screens
    content: Checkout panel (guest email when signed out, pay succeed or fail), confirmation, error states
    status: completed
  - id: it-8-tickets-screens
    content: My bookings with QR, guest access page, lost-link form
    status: completed
  - id: it-9-docs-verify
    content: "DECISIONS entry 5, README, install skill check, full verify, roadmap status. Manual end-to-end for buyer and guest, expiry on screen and the two-browser race run by the repository owner in desktop Chrome on 2026-11-27 (seat map, hold countdown, checkout, bookings, guest link). GitHub Actions passed on main after the merges (owner-confirmed, 2026-11-27). Still open: operator items in the release guide, deferred to deploy (not deployed by this project)."
    status: completed
isProject: false
---

# Phase 3 - Buyer flow

Roadmap: `plans/seatholder_product_roadmap.plan.md`, phase 3. Uses Phase 1 auth and CSRF, Phase 2 booking API.

## 1. Context

The brief's working flow is search -> seat map -> hold -> pay -> ticket with QR, for both a registered user and a guest. A plain UI that completes the whole flow comes before any styling (Phase 6). The two required custom components start here as real extensions of Mantine, so Phase 6 only deepens them.

## 2. Agreed decisions

| Topic | Decision |
|---|---|
| Search result unit | One row per event (show + venue + date + price + seats left). Seats left is one grouped count per result page over the index `seats(event_id, status)`, applying the lazy-expiry rule; no stored counter |
| Text search | `q` matches the show title through a stored generated column `shows.search_vector` (`to_tsvector('simple', title)`, GIN index), or the venue name through `ILIKE` on the small `venues` table |
| Date-time filter | `from` and `to` as ISO instants (UTC) in the query; the UI edits them in the browser's local time and shows the venue's timezone on each result |
| Filters | Combinable, AND across fields; `type`, `genre`, `country`, `city`, `venueId` single-value; facets endpoint feeds the dropdowns |
| Pagination | `page` and `pageSize` (max 50), ordered by `starts_at`, then `id` |
| Filter state | URL query string (rule 30, state hierarchy) |
| Live seat status | TanStack Query polls the public seat route every `VITE_SEAT_POLL_INTERVAL_MS` (3000) on the event page only; the viewer's hold is refetched after each hold or release and on window focus, and the client marks those seats `held_by_me` |
| QR | Rendered in the browser with `qrcode` from the ticket code; payload `SEATHOLD:<code>` |
| Guest link | Single exchange: the emailed link is `FRONTEND_ORIGIN/guest/access#t=<token>` (fragment, so the token is not in server logs or Referer); the page posts it to `/api/guest/exchange`, which consumes it once and sets a guest session cookie scoped to that booking |
| Guest link lifetime | Exchange within `GUEST_LINK_TTL_HOURS` (168); guest session valid until the event start plus 1 day |
| Lost link | `POST /api/guest/resend` with the email: always 204; if confirmed upcoming guest bookings exist, new links are emailed, every older unused link for those bookings is invalidated, and every guest session for them is revoked; same database-backed rate limit pattern as login codes |
| Tokens | 32 random bytes, SHA-256 stored; guest session cookie `gsid` (`HttpOnly`, `SameSite=Lax`, `Path=/api`, `Secure` in production) |
| Base theme | Own palette, font stack and radius through Mantine `createTheme`, applied to every screen from it-4 on, so "themed, not library defaults" holds even if Phase 6 is cut |

## 3. Security principles

- Ticket codes, guest link tokens and guest session tokens are random and unguessable; only hashes of link and session tokens are stored.
- A guest session reads exactly one booking; it cannot act as a user or reach other bookings.
- My bookings returns only the caller's bookings (ownership filter in the query).
- Resend and exchange never reveal whether an email has bookings.
- All mutations keep CSRF and Origin checks.

## 4. Architecture

```text
backend/src/modules/catalog/
  application/       SearchEventsQuery, GetFacetsQuery, GetEventQuery
  presentation/http/ routes (shows-search, shows-facets, event-detail)
backend/src/modules/booking/
  application/       ListMyBookingsQuery
  presentation/http/ routes (my-bookings)
backend/src/modules/guest-access/
  domain/, application/ (IssueGuestLinkService, ExchangeGuestLinkService, ResendGuestLinksService, GetGuestBookingQuery)
  infrastructure/    repositories, email template via EmailProvider
  presentation/http/ routes (exchange, guest-booking, resend), hooks/require-guest-session
  index.ts           called by booking checkout after a confirmed guest booking
frontend/src/shared/ui/date-time-range-picker/
frontend/src/shared/ui/seat-map/
frontend/src/features/discovery/, event/, checkout/, my-bookings/, guest/
```

Cross-module: booking calls `guest-access` through its `index.ts` after a confirmed guest checkout; guest-access reads bookings through booking's public query.

## 5. Data model

| Table | Key columns | Constraints |
|---|---|---|
| `guest_access_links` | `id`, `booking_id`, `token_hash`, `expires_at`, `consumed_at`, `invalidated_at`, `created_at` | `UNIQUE(token_hash)`; FK `booking_id`; index `(booking_id)` |
| `guest_sessions` | `id`, `booking_id`, `token_hash`, `expires_at`, `revoked_at`, `created_at` | `UNIQUE(token_hash)`; FK `booking_id`; index `(booking_id)` |
| `shows` (change) | `search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', title)) STORED` | GIN index |

## 6. Key flows

1. **Search.** Validate query (zod) -> SQL with indexed filters and `starts_at BETWEEN from AND to` -> page of event DTOs with seats left.
2. **Signed-in purchase.** Event page -> click seats (Phase 2 hold API) -> countdown from `expires_at` -> pay succeed -> booking appears in My bookings with QR per ticket.
3. **Guest purchase.** Same, checkout asks for email -> booking confirmed -> `IssueGuestLinkService` stores a hashed token and emails the link (Mailpit) -> confirmation screen says "check your email".
4. **Exchange.** `/guest/access` reads the fragment -> `POST /api/guest/exchange` -> link valid and unconsumed: consume (conditional UPDATE), create guest session, set `gsid`, return booking -> page shows ticket and QR. Second use of the link -> 410 `LINK_USED` with a "request a new link" action.
5. **Lost link.** Form posts email to resend -> 204 -> new links for upcoming confirmed guest bookings; older links invalidated and existing guest sessions for those bookings revoked.
6. **Hold expires on screen.** Countdown hits zero -> the map refetches, seats show available, checkout disabled with a message.
7. **Seat lost in a race.** Hold call returns 409 -> toast "seat just taken", map refetches.

## 7. Configuration

| Variable | Default | Secret |
|---|---|---|
| `GUEST_LINK_TTL_HOURS` | `168` | no |
| `GUEST_RESEND_LIMIT` / `_WINDOW_MINUTES` | `3` / `60` | no |
| `VITE_SEAT_POLL_INTERVAL_MS` | `3000` | no (public) |

## 8. HTTP API

| Route | Auth | CSRF | Notes |
|---|---|---|---|
| `GET /api/shows` | none | - | filters, pagination |
| `GET /api/shows/facets` | none | - | distinct types, genres, countries, cities, venues |
| `GET /api/events/:eventId` | none | - | show, venue, date, price |
| `GET /api/me/bookings` | session | - | bookings with tickets and codes |
| `POST /api/guest/exchange` | none | yes | body `{ token }`; sets `gsid` / 410 |
| `GET /api/guest/booking` | guest session | - | the one booking with tickets |
| `POST /api/guest/resend` | none | yes | body `{ email }`; 204 / 429 |

## 9. Iterations

- **it-0 Approvals.** `qrcode`, `@types/qrcode` (dev); defaults in section 2. Run note: the run also added `@mantine/dates` (9.8.2) and `dayjs` (1.11.23) for the DateTimeRangePicker, approved by the user; the plan listed only `qrcode`.
- **it-1 Search API.** Integration tests first: each filter alone and combined; date range edges inclusive; text search matches title and venue; pagination stable; invalid range (`from > to`) 400; query uses indexes (EXPLAIN check noted, not asserted).
- **it-2 Event detail and My bookings.** Route tests first: My bookings returns only my bookings with ticket codes; anonymous 401; event detail 404 for unknown id.
- **it-3 Guest access.** Tests first: guest checkout issues one link and sends one email; exchange consumes once (second call 410); expired link 410; guest session reads only its booking; resend invalidates older links, revokes existing guest sessions for those bookings, and is rate limited; resend for an unknown email still 204 and sends nothing; concurrent double exchange yields one session.
- **it-4 Base theme and DateTimeRangePicker v1.** Base theme (own palette, font stack, radius) applied app-wide. Component tests first: one control opens a popover with a range calendar and from/to time fields; emits ISO instants; prevents `to` before `from`; clearing resets both; keyboard reachable. Built by composing Mantine `DatePicker` (range) and `TimeInput` inside our own component, not a stock Mantine control.
- **it-5 Discovery screen.** Tests first: filters write to the URL and restore from it; results render; empty state.
- **it-6 SeatMap v1 and hold.** Tests first: renders the grid from seat DTOs with four distinct states and accessible labels (`Row C, seat 7, available`); click calls hold and shows held-by-me; clicking my seat releases; countdown renders from `expires_at` and disables checkout at zero; polling refreshes the public states, and my seats come from the hold route.
- **it-7 Checkout screens.** Tests first: signed-out shows the email field; pay succeed shows confirmation; pay fail keeps the hold and shows retry; 409 `HOLD_EXPIRED` shows the expiry message.
- **it-8 Tickets screens.** Tests first: My bookings lists tickets with a QR each; guest access page exchanges the fragment token and clears it from the address bar; used link shows the resend form.
- **it-9 Docs and verify.** `DECISIONS.md` entry 5 (guest link) matching the code. README flow section. Install skill re-run on the Mac path. Manual end-to-end: buyer and guest from search to QR. AI workflow log entry. Full `npm run verify`; roadmap todo.

## 10. Verification summary

- Integration: search filters, guest link lifecycle and races, ownership of bookings.
- Component: picker, seat map, checkout states, guest page.
- Manual: both purchase paths end to end; expiry on screen; race between two browsers.

## 11. Out of scope / future

- SSE or WebSocket live updates (polling chosen).
- Ticket check-in scan endpoint, waitlist, waiting room.
- Theming depth, picker presets, seat map zoom (Phase 6).
