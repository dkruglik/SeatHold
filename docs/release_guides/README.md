# Release guides

One guide per merge request, newest first.

- [Release guide: Phase 6 design system](phase-6-design-system.md) — 2026-11-27 — Frontend only: range picker presets, seat map keyboard, tooltip and zoom, dark scheme toggle and a 360 px layout with a sticky checkout bar; static build, no migrations, no variables, no secrets; deploys after Phase 5, rollback is the previous static build.
- [Release guide: Phase 5 deliverables](phase-5-deliverables.md) — 2026-11-27 — Final README, install skill with static check and decision entries O111 to O114; the only runtime change is `Cache-Control: no-store` and `Vary: Cookie` on `GET /api/auth/me`; no migrations, no variables, no secrets; backend only, after Phase 4.
- [Release guide: Phase 4 back office](phase-4-back-office.md) — 2026-11-27 — Admin screens and routes: create events with a generated grid (up to 20,000 seats), event list, open and bought tickets, manual release of a held seat with a logged reason; one additive migration (`seat_release_log`), no variables, no secrets; deploys after Phase 3, backend then frontend.
- [Release guide: Phase 3 buyer flow](phase-3-buyer-flow.md) — 2026-11-27 — Search, seat map, checkout, My bookings and emailed guest links in the browser; two additive migrations (search column and GIN index, three guest tables), four public variables, no new secrets; deploys after Phase 2, backend and frontend together.
- [Release guide: Phase 2 booking core](phase-2-booking-core.md) — 2026-11-26 — Catalog, seat holds with lazy expiry and mock checkout over HTTP (no UI); one additive migration (eight tables), three optional variables, no new secrets; catalog seed is local only; deploys after Phase 1.
- [Release guide: Phase 1 auth and access](phase-1-auth-access.md) — 2026-11-26 — Email-code login, sessions, CSRF and Origin checks, admin boundary; one additive migration (`citext`, three tables), new secrets, first admin by hand; deploys after Phase 0.
- [Release guide: Phase 0 setup](phase-0-ignore-agent-env.md) — 2026-11-26 — Runnable skeleton, Docker Compose stack, backend image and GitHub Actions CI; nothing deployed, no migrations.
