# Release guides

One guide per merge request, newest first.

- [Release guide: Phase 3 buyer flow](phase-3-buyer-flow.md) — 2026-11-27 — Search, seat map, checkout, My bookings and emailed guest links in the browser; two additive migrations (search column and GIN index, three guest tables), four public variables, no new secrets; deploys after Phase 2, backend and frontend together.
- [Release guide: Phase 2 booking core](phase-2-booking-core.md) — 2026-11-26 — Catalog, seat holds with lazy expiry and mock checkout over HTTP (no UI); one additive migration (eight tables), three optional variables, no new secrets; catalog seed is local only; deploys after Phase 1.
- [Release guide: Phase 1 auth and access](phase-1-auth-access.md) — 2026-11-26 — Email-code login, sessions, CSRF and Origin checks, admin boundary; one additive migration (`citext`, three tables), new secrets, first admin by hand; deploys after Phase 0.
- [Release guide: Phase 0 setup](phase-0-ignore-agent-env.md) — 2026-11-26 — Runnable skeleton, Docker Compose stack, backend image and GitHub Actions CI; nothing deployed, no migrations.
