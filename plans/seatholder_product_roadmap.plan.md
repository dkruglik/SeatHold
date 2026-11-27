---
name: SeatHolder product roadmap
overview: "SeatHolder (brief name: SeatHold) is a ticket-ordering platform: find a show, hold seats on a seat map for a limited time, pay inside the window. Built as the Appcharge AC11 test task in 4-6 hours of Claude-driven work. Phases are ordered by priority: the auth foundation first, because the booking core, the buyer flow and the back office all build on it; then the booking core (a seat is never sold twice, deterministic hold expiry), then a working end-to-end flow, with the written decisions and the install skill growing alongside the code. If time runs out, cut from the last phase backwards."
todos:
  - id: phase-0-setup
    content: "Phase 0 built on branch feature/phase-0-ignore-agent-env, 2026-11-26: npm workspaces and tooling, typed config, Docker Compose (Postgres 17, Mailpit), Fastify backend with /api/health, database clock and graceful shutdown, Vite + React + Mantine frontend on /api, backend image and GitHub Actions CI, skeletons of install-seathold skill, README, DECISIONS.md and AI workflow log. Still open: first GitHub Actions run (multi-arch image build, arm64 unproven on the dev host), install-seathold run on a clean Mac, deploy and release-guide checks (plan: plans/phase_0_setup.plan.md)"
    status: completed
  - id: phase-1-auth
    content: "Phase 1 built on branch feature/phase-1-auth-access, 2026-11-26: email-code login, Postgres sessions with hashed tokens, roles (buyer default, admin via seed and user:promote CLI only), CSRF and Origin checks, /api/admin/* prefix hook with route-wide 401/403 test, seeded admin and buyer, login screen and route guards, DECISIONS security entry, release guide (docs/release_guides/phase-1-auth-access.md). Still open: login flow not run in a real browser against a real backend; first GitHub Actions run; Phase 0 branch not merged yet (Phase 1 is based on it); production deploy and release-guide checks; no migration path in the backend image (DECISIONS O35) (plan: plans/phase_1_auth_access.plan.md)"
    status: completed
  - id: phase-2-booking-core
    content: "Phase 2 built on branch feature/phase-2-booking-core, 2026-11-26: catalog schema and deterministic seed (200 shows, 200 events, 200 seats each), hold and release with one conditional UPDATE per seat, lazy expiry and idempotent sweeper, checkout with mock payment and late-payment rejection, booking HTTP routes with visitor identity and adoption on login, DECISIONS entries for locking, hold state and expiry, late payment, data store, release guide (docs/release_guides/phase-2-booking-core.md). Still open: deploy and release-guide checks; human review of the whole branch; second external review of the last commits; first GitHub Actions run; no browser UI until Phase 3 (plan: plans/phase_2_booking_core.plan.md)"
    status: completed
  - id: phase-3-buyer-flow
    content: "Phase 3 built on branch feature/phase-3-buyer-flow, 2026-11-27, 9 of 10 iterations: show search with filters and DateTimeRangePicker, SeatMap with hold, countdown and polling, mock payment, checkout panel, My bookings with QR, guest one-time link with QR and lost-link resend; DECISIONS O70-O82, README buyer-flow section, release guide docs/release_guides/phase-3-buyer-flow.md. Still open: manual browser end-to-end for buyer and guest (not run on this branch yet), expiry on screen and two-browser race, full npm run verify before push, operator items in the release guide (plan: plans/phase_3_buyer_flow.plan.md)"
    status: in_progress
  - id: phase-4-backoffice
    content: "Phase 4 built on branch feature/phase-4-back-office, 2026-11-27, 7 of 8 iterations: create event with generated rows x seats grid (one transaction), admin event list and lookups, open tickets (available and held, lazy expiry), bought tickets (buyer email, time, status), /admin screens (event list, create form, detail tabs), manual release of a held seat with reason and log row, DECISIONS O83-O109, README admin section, release guide docs/release_guides/phase-4-back-office.md. Still open: manual browser check as buyer and admin (only jsdom and integration tests run), second code review round, full npm run verify on the final commit, GitHub Actions run; stacked on feature/phase-3-buyer-flow (Phase 3 PR not merged) (plan: plans/phase_4_back_office.plan.md)"
    status: in_progress
  - id: phase-5-deliverables
    content: "Phase 5: install-seathold verified on a clean Mac (< 10 min), README with what was cut, DECISIONS caching / latency / scale / own KPI, AI workflow section (plan: plans/phase_5_deliverables.plan.md)"
    status: pending
  - id: phase-6-design-system
    content: "Phase 6: Mantine theme and component layer depth, DateTimeRangePicker and SeatMap extensions polished, desktop and mobile layouts, optional extras (plan: plans/phase_6_design_system.plan.md)"
    status: pending
isProject: true
---

# SeatHolder product roadmap

Source brief: `plans/Appcharge_AC11_TeamLeader_AI_Test_Task_PartA.md`.

## Status

| Phase | Status | Detailed plan |
|---|---|---|
| 0 Setup | completed (8/8 iterations; open: GitHub Actions run, clean-Mac install, deploy and release-guide checks) | [phase_0_setup.plan.md](phase_0_setup.plan.md) |
| 1 Auth and access | completed (9/9 iterations; open: browser run of the login flow, GitHub Actions run, Phase 0 merge, production deploy and release-guide checks, migration path in the backend image (DECISIONS O35)) | [phase_1_auth_access.plan.md](phase_1_auth_access.plan.md) |
| 2 Booking core | completed (8/8 iterations; open: deploy and release-guide checks, human review of the whole branch, second external review of the last commits, first GitHub Actions run, browser run (UI is Phase 3)) | [phase_2_booking_core.plan.md](phase_2_booking_core.plan.md) |
| 3 Buyer flow (end to end) | in progress (9/10 iterations, it-0 to it-8 completed, it-9 in progress; open: manual browser end-to-end for buyer and guest, expiry on screen and two-browser race, full verify before push, operator items in the release guide) | [phase_3_buyer_flow.plan.md](phase_3_buyer_flow.plan.md) |
| 4 Back office | in progress (7/8 iterations, it-0 to it-6 completed, it-7 in progress; open: manual browser check as buyer and admin, second review round, full verify on the final commit, GitHub Actions run; stacked on the unmerged Phase 3 branch) | [phase_4_back_office.plan.md](phase_4_back_office.plan.md) |
| 5 Deliverables | pending | [phase_5_deliverables.plan.md](phase_5_deliverables.plan.md) |
| 6 Design system depth | pending | [phase_6_design_system.plan.md](phase_6_design_system.plan.md) |

## Priority principles

- Auth and access control come first, so every later route is born behind the right check instead of being retrofitted.
- The booking core is built and proven right after auth, before any screen depends on it. No later phase may weaken its tests.
- A plain UI that completes the whole flow beats a polished UI for half of it. Phase 3 reaches search to QR, for both a signed-in buyer and a guest, before any styling.
- `DECISIONS.md` is written in the same phase as the code it describes, so every entry matches the code. Phase 5 only adds the entries that have no code of their own.
- The install skill exists from Phase 0 and grows with each phase, so the final clean-Mac run is a check, not a first attempt.
- The AI workflow log (prompts that worked, places where Claude was wrong and how it was caught) is kept as work happens, not reconstructed at the end.
- Phase 6 is the first to cut.

## Time budget and cut list

| Phase | Budget |
|---|---|
| 0 Setup | 0.75 h |
| 1 Auth and access | 0.75 h |
| 2 Booking core | 1 h |
| 3 Buyer flow | 1.25 h |
| 4 Back office | 0.5 h |
| 5 Deliverables | 0.75 h |
| 6 Design system depth | 0.5 h |

About 5.5 hours in total. Iterations are review units for AI-driven work, not hours each.

Cut candidates, in order: Phase 6 beyond the base theme (the base theme ships in Phase 3); manual seat release (Phase 4 it-6); guest link resend (Phase 3, keep exchange); search facets endpoint; multi-architecture image build in CI (amd64 only). Mirrored in `DECISIONS.md`, "Scope and cuts".

## Agreed decisions

| Topic | Decision |
|---|---|
| Name | Repo and code: SeatHolder / `seatholder`. Install skill path fixed by the brief: `.claude/skills/install-seathold/SKILL.md` |
| Repository | Public GitHub. Real commit history, no squash |
| Committed AI setup | `CLAUDE.md` and the install skill only. `.cursor/` and `.claude/` rules and skills stay local (`.gitignore`). The committed `CLAUDE.md` must stand alone: it cannot point at rule files reviewers will not see |
| Stack | Backend: Node, TypeScript, Fastify, Prisma, PostgreSQL. Frontend: React, TypeScript, Vite. Tests: Vitest. npm workspaces `backend/` and `frontend/` |
| Local infra | Development on Windows: Docker Compose (Postgres, Mailpit). Install skill on a clean Mac: Homebrew services (`postgresql@17`, `mailpit`) so it runs without a GUI install. Both paths read the same `.env` keys |
| UI base library | Mantine, themed. Own extensions: `DateTimeRangePicker` (date + time from-to in one control) and `SeatMap` (SVG) |
| Data store | PostgreSQL only. No Redis (rule 45) |
| Locking | Per seat: conditional `UPDATE seats ... WHERE id = $seat AND (status = 'available' OR (status = 'held' AND held_until <= $now))`; zero rows means the seat is taken (409). Parallel first clicks of one holder share one hold (`INSERT ... ON CONFLICT DO NOTHING`). `UNIQUE(seat_id)` on tickets is the backstop, with its own test. Details: `DECISIONS.md` D1 |
| Hold expiry | Lazy: a hold is valid while `held_until > $now`. Optional sweeper for tidiness only; it also takes `$now` from the Clock, and its `UPDATE` is idempotent, so concurrent runs on several instances are harmless (production would schedule it once, e.g. EventBridge Scheduler). Details: `DECISIONS.md` D2 |
| Clock source | `Clock` port with two adapters: production reads database time (`SELECT clock_timestamp()`) once per operation and passes it as `$now` to every statement of that operation, so several backend instances with skewed host clocks agree on expiry; tests inject a controlled clock. No SQL statement calls `now()` itself. Details: `DECISIONS.md` O4 |
| API origin | The API is always served under `/api` on the frontend's origin: Vite dev proxy locally, CloudFront path routing to the ALB in production. Keeps `SameSite=Lax` session cookies and CSRF working without credentialed cross-site CORS |
| Container image | `backend/Dockerfile`: multi-stage, non-root, health check, Prisma engine for linux (and arm64). Built in CI, not deployed (rule 50) |
| Postgres version | 17 everywhere: Docker Compose, Homebrew `postgresql@17`, CI service, and the RDS target |
| Late payment | Confirm runs `UPDATE seats ... WHERE hold_id = $hold AND status = 'held' AND held_until > $now`; fewer rows than the hold's seats means the booking is rejected and the mock payment is voided. Details: `DECISIONS.md` D4 |
| Seat map API | Public seat route (identical for every viewer, edge-cacheable) plus a separate uncached hold route for the viewer's own seats. Details: `DECISIONS.md` D3 |
| Event size | 1-200 rows, 1-200 seats per row, at most 20,000 seats per event. Details: `DECISIONS.md` O17 |
| Visitor hold on login | The next booking request after login moves the visitor's active holds to the user, unless the user already holds seats for that event (then the visitor's seats are released). Details: `DECISIONS.md` O18 |
| Decision record | Every decision and trade-off lives in `DECISIONS.md`; this table is a summary and must not contradict it |
| Login | Passwordless email code (rule 41), codes delivered to Mailpit locally. Sessions in Postgres, hashed tokens, CSRF on mutations. One login flow for buyers and admins |
| Back-office access | One `users` table with `role` (`buyer` default, `admin`). Sign-up always creates `buyer`; `admin` is granted only by seed or a backend CLI (`npm run user:promote -- <email>`), never over HTTP. All back-office API lives under `/api/admin/*`, one Fastify plugin whose `onRequest` hook runs `requireAuth` then `requireRole('admin')` (hook in `modules/auth/presentation/http/hooks/`), so no route can opt out. The session stores only the user id; the role is read from the database on each admin request, so demotion and revocation are immediate. No session -> 401, buyer -> 403 with a stable error code. The frontend `/admin` guard (from `/api/auth/me`) is UX only. No separate admin login page: it would reveal which emails are admins |
| Guest link | Single exchange: the emailed link (token in the URL fragment) is exchanged once for a guest session cookie scoped to that booking, valid until the event start plus 1 day; exchange window 168 h; a lost link is replaced by requesting a new one by email, which invalidates older unused links and revokes existing guest sessions for those bookings. Decided 2026-11-26 |
| Hold model | Hold on click: each click holds that seat at once and adds it to the holder's single active hold for the event; all seats share the expiry set when the hold is created. Holder is a signed-in user or an anonymous visitor cookie. Decided 2026-11-26 |
| Seat cap | MAX_SEATS_PER_HOLD (default 10) per hold; per-buyer-per-show limits stay out of scope. Decided 2026-11-26 |
| Seed data | About 12 venues across about 5 countries and 8 cities, 200 shows, one event per show over the next 90 days, each with a 10 x 20 generated grid (200 seats). Decided 2026-11-26 |
| CI | GitHub Actions; scripts/verify.mjs runs the same steps locally; GitLab references are replaced in Phase 0. Decided 2026-11-26 |
| Public CLAUDE.md | Committed and standalone; the local agent index moves to an untracked CLAUDE.local.md. Decided 2026-11-26 |
| Live seat status | Polling (cheap; SSE/WebSocket out of scope) |
| Out of scope | Real payments, real email, cloud deployment, mobile apps, i18n (brief section 7) |

## Production target (not built)

Cloud deployment is out of scope; this is the target the design must not block, and the AWS answer for the scale section of `DECISIONS.md`.

| Layer | AWS service |
|---|---|
| Frontend (static Vite build) | S3 + CloudFront; `/api/*` behaviour routed to the ALB |
| Backend (Fastify container) | ECS Fargate behind an ALB; `/api/health` as target-group check; graceful stop on SIGTERM |
| Database | RDS or Aurora PostgreSQL 17, RDS Proxy for pooling (mind Prisma interactive-transaction pinning) |
| Migrations | `db:migrate:deploy` as a one-off ECS task before each rollout |
| Email | SES through the existing SMTP branch of `EmailProvider` (config only) |
| Secrets | Secrets Manager or SSM Parameter Store, injected as task environment |
| Logs and metrics | CloudWatch from Pino JSON on stdout |
| Edge | WAF rate rules; a virtual waiting room in front of on-sales |
| Later, if needed | ElastiCache for sessions and hot reads (needs approval, rule 45) |

Invariants that keep this path open: no request or hold state in process memory, configuration only from environment, one origin for frontend and API, database time for expiry, a container image that builds in CI.

## Phase 0: Setup

Scaffold an empty but runnable SeatHolder full stack: npm workspaces, strict TypeScript, lint and tests, typed config, a Fastify backend with health, database-time clock and graceful shutdown, a Vite + React + Mantine frontend on the same /api origin, Docker Compose locally, a backend image and CI. Also starts the deliverables (install skill, README, DECISIONS.md, AI workflow log) so they grow with every later phase.

Iterations: it-0 approvals, it-1 git hygiene, it-2 workspaces and tooling, it-3 config and local infra, it-4 backend skeleton, it-5 frontend skeleton, it-6 image and CI, it-7 deliverable skeletons

Exit: npm run verify-fast-part passes on Windows; docker compose up + npm run dev serves /api/health and the frontend page.

Detailed plan: [phase_0_setup.plan.md](phase_0_setup.plan.md)

## Phases 1-6 (summary)

- **1 Auth and access.** Tables `users` (`role`), `auth_codes` (hash, expiry, attempts), `sessions` (token hash). `EmailProvider` with console and SMTP (Mailpit) branches. Routes `/api/auth/request-code`, `/api/auth/verify`, `/api/auth/me`, `/api/auth/logout`; `requireAuth`, `requireRole`, CSRF and Origin hooks; an empty `/api/admin/*` plugin with its prefix hook; `npm run user:promote` CLI; seeded `admin@seathold.local` and `buyer@seathold.local`; login screen and `/api/auth/me`-driven app state. Tests first: code hashing, expiry, attempt limit and single use; sign-up never yields `admin`; a route test that lists every registered `/api/admin/*` route and asserts 401 anonymous, 403 buyer, 2xx admin, so later routes are covered automatically; CSRF rejects a mutation without the token (403). Install skill prints both logins and the Mailpit URL. Written: security baseline, what to add before production (rate limiting, admin session timeout, admin audit log, fresh code for destructive admin actions). Detailed plan: [phase_1_auth_access.plan.md](phase_1_auth_access.plan.md).
- **2 Booking core.** Tables `venues`, `shows`, `events`, `seats` (status, `hold_id`, `held_until`), `holds`, `bookings` (user or guest email), `tickets` (`UNIQUE(seat_id)`), `payments`. Seed: about 12 venues, 200 shows, one event per show with a generated 10 x 20 grid (200 seats). Tests first: 100 parallel holds on one seat produce exactly 1 winner (real isolated Postgres via `scripts/test-db.mjs`); a controlled-clock expiry returns the seat to sale; late payment is rejected; parallel first clicks of one holder share one hold; a forced second ticket for a sold seat is rejected by `UNIQUE(seat_id)`; the database-time clock adapter is what the production wiring uses. Written: decisions 1 (locking), 2 (hold state and expiry), 4 (late payment), 6 (data store). Detailed plan: [phase_2_booking_core.plan.md](phase_2_booking_core.plan.md).
- **3 Buyer flow.** `GET /api/shows` with type, genre, country, city, venue, text and from-to DateTime filters, paginated, indexed. Plain screens built on the design-system layer: discovery with `DateTimeRangePicker`, `SeatMap` with the four seat states, countdown and polling, mock payment that can succeed or fail. Signed-in buyer: My bookings with an opaque QR per ticket. Guest: checkout by email with a hashed, expiring one-time link (mocked email to Mailpit) showing the ticket and QR. Written: decision 5 (guest link). Detailed plan: [phase_3_buyer_flow.plan.md](phase_3_buyer_flow.plan.md).
- **4 Back office.** Routes added inside the `/api/admin/*` plugin from Phase 1, so the access test covers them with no new auth code: create event (rows x seats grid), open tickets (available and held), bought tickets (buyer, time, status); `/admin` screens; one proposed operator capability documented. Detailed plan: [phase_4_back_office.plan.md](phase_4_back_office.plan.md).
- **5 Deliverables.** `install-seathold` run end to end on a clean Mac (prerequisites, `brew` services, install, migrate, seed, start FE and BE, print URLs and test logins) in under 10 minutes; `README.md` with what was cut; `DECISIONS.md` decision 3 (caching: public seat availability per event cached at CloudFront for 1-2 s, the per-user "held by me" state from a separate uncached call, holds, payments and sessions never cached), latency targets, scale for 100,000 visitors / 20,000 seats on the AWS target above (seat-map polling load, a session read per request on the writer with ElastiCache as the later fix, waiting room, hot seat rows), security additions (WAF rate rules at the edge plus database-backed counters for login-code requests, since in-process rate limits do not work across instances), own KPI; AI workflow section with one real example where Claude was wrong. Detailed plan: [phase_5_deliverables.plan.md](phase_5_deliverables.plan.md).
- **6 Design system depth.** Theme beyond defaults, extra behaviour on the two extended components, desktop and mobile layouts on every screen; optional items from brief section 5 only after everything above is solid. Detailed plan: [phase_6_design_system.plan.md](phase_6_design_system.plan.md).
