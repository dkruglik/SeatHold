# SeatHolder

SeatHolder (the brief calls it SeatHold) is a ticket-ordering platform: find a show, hold seats on a seat map for a limited time, and pay inside the window. It is the Appcharge AC11 test task, built with Claude.

Stack: Node 24, TypeScript, Fastify, Prisma, PostgreSQL 17 on the backend; React, TypeScript, Vite and Mantine on the frontend; npm workspaces `backend/` and `frontend/`; Vitest.

## Working rules

- Test first. Write the test, watch it fail for the right reason, then write the minimum code to pass it.
- Modular monolith. Backend modules keep layers apart (presentation, application, domain, infrastructure); routes are thin and call application services. Cross-cutting checks (auth, CSRF, origin) are shared Fastify hooks, never repeated in routes.
- All HTTP routes live under `/api` on the frontend's origin (Vite proxy locally), so cookies stay first-party and CORS stays closed.
- Instances are stateless. Shared state lives in PostgreSQL; expiry compares against database time read once per operation through the `Clock` port, and tests inject a controlled clock.
- Locking model: a seat is never sold twice. Holding a seat is one conditional `UPDATE ... WHERE status = 'available' OR (status = 'held' AND held_until <= $now)`; zero rows means the seat is taken (409). Holds expire lazily, and `UNIQUE(seat_id)` on tickets is the backstop. No check-then-write in application code.
- Configuration comes only from environment variables, validated at startup. Never commit secrets.
- Every decision and trade-off is recorded in `DECISIONS.md`.

## Verify

Run `npm run verify` before declaring work done. While iterating, `npm run verify-fast-part` skips the slow integration tests; `npm run verify-slow-part` runs only those.

## Plans

Plans live in `plans/`. Start with `plans/seatholder_product_roadmap.plan.md`; each phase has its own `plans/phase_<n>_*.plan.md`.
