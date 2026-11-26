# AI workflow log

How AI was used to build SeatHolder, how it was directed and checked, and where it went wrong. Entries are dated and added as the work goes on; the final write-up for the submission is built from this log.

## 2026-11-26: Phase 0 (setup)

**What the AI did.** The run followed the plan phases it-0 to it-7 of `plans/phase_0_setup.plan.md` in order: repository ignore rules and a standalone `CLAUDE.md`, npm workspaces with TypeScript, lint, Vitest and Prisma tooling, a GitHub Actions workflow that `scripts/verify.mjs` mirrors locally, typed config and local Compose, the Fastify backend skeleton, the React and Vite frontend skeleton, the backend Docker image, and these deliverable skeletons. The commits are s0 `b849e2c`, s1 `c84f8ce` and `ad4b64c`, s2 `a2140b1` and `8c7e00f`, s3 `18be56e`, s4 `82037b6`, s5 `e44fe9d`, s6 `ac2135a`.

**How it was directed.** Each iteration was test-first: the tests were written and shown failing before any code. A Claude Sonnet subagent implemented the iteration from a self-contained brief (task, files, test, done-when command, rules). The main agent then checked the result against the code and a fresh `verify-fast-part` run, and only then committed. Dependencies, Node 24, the move from GitLab to GitHub Actions and the public `CLAUDE.md` were approved by the human up front; anything outside that list was reported, not added.

**Where it went wrong and how it was caught.** The main agent's review of the subagent work found four problems:

- The `sync-ai-rules` check for path scopes that match no tracked file had been relaxed to a warning, which would let a rule silently govern nothing. It was restored as a strict check with an explicit allowlist, each entry naming when its files arrive.
- The request logger redacted the cookie, CSRF and `set-cookie` headers but not `authorization`, while it logged all request headers. This was fixed test-first: a failing redaction test, then the config change.
- The Vite proxy test was written after the proxy configuration, against the test-first rule. It was flagged as a process deviation; the test still asserts the behavior.
- The arm64 image build could not be proven on the development host (no buildx or QEMU). It is checked only by the CI `image-build` job, and `DECISIONS.md` says so.

**Not yet done.** The workflow has not run on GitHub, and the macOS install skill has not been run on a clean Mac.

## 2026-11-26: Phase 1 (auth and access)

**What the AI did.** The run followed iterations it-1 to it-7 of `plans/phase_1_auth_access.plan.md`, then this documentation step (it-8): the email provider port with console and SMTP adapters (it-1, `a0746e4`), the auth schema, migration and repositories (it-2, `dd41b53`), login code request and verify services (it-3, `6c62d74`), sessions, the `sid` cookie and the auth routes (it-4, `2db1e99`), CSRF token and Origin checks on browser mutations (it-5, `b521d9e`), the admin boundary, role hook, promote and demote scripts and the seed (it-6, `09f7ef2`), and the login screen, auth state and route guards in the frontend (it-7, `49b1104`). The install skill, `DECISIONS.md` security entry (O56) and README "Authentication" section came with it-8.

**How it was directed.** Each iteration was briefed to a Claude Sonnet subagent as a self-contained step: tests first and shown failing, then the minimum code, then the done-when command. The main agent checked every report against the code and a fresh `verify-fast-part` run before committing, one commit per iteration. The approved new dependencies (`nodemailer`, `@types/nodemailer`, `@fastify/cookie`, `@fastify/csrf-protection`) were listed up front; anything else was to be reported, not installed.

**Where it went wrong and how it was caught.**

- In it-1 the subagent reported a passing fast verify, but a fresh run by the main agent failed at the sync allowlist check: stale allowlist entries for path scopes whose files had since arrived. They were removed.
- Three pieces of work were not test-first. it-3's lifecycle integration test, it-4's runtime test and it-6's admin plugin tests were written after the code. Where red was shown at all, it was shown afterwards by breaking the code; for some of it, not at all. The tests assert the behavior, but the process rule was broken and is recorded here.
- The frontend `ApiClient` read the wrong error shape (`body.code` instead of `error.code`) until it-7 found it and fixed it test-first.
- The CSRF and Origin hooks arrived one iteration after the routes they protect, so the branch had a documented unprotected window for mutations between it-4 and it-5. It-5 closed it; nothing was merged or deployed in between.

**Not yet done.** The login flow has not been exercised in a real browser against a real backend, and the CI workflow has not run on GitHub. Open security risks and the before-production list are in `DECISIONS.md` O56.

## 2026-11-26: Phase 2 (booking core)

**What the AI did.** The run followed iterations it-1 to it-6 of `plans/phase_2_booking_core.plan.md`, then this documentation step (it-7, docs part). Booking configuration (`d80b207`); the booking schema with seat, hold and ticket constraints (`d5610c6`) and the deterministic idempotent catalog seed (`8933b64`), both it-1; the seat state, holder, money and hold rules domain (it-2, `a19d396`); hold and release services with the conditional seat UPDATE (it-3, `dbfaa06`); the lazy-expiry seat map, current hold query and sweeper (it-4, `e006271`); checkout with the mock payment and late-payment rejection (it-5, `794f729`); and the booking HTTP API in three commits (it-6): visitor identity, seat map and current hold routes (`bd0f4eb`), hold and release routes with visitor hold adoption (`44aeff2`), and the checkout route with a strict body and no-store (`7ca8dc8`). The documentation step moved the Phase 2 entries of `DECISIONS.md` to `implemented`, added O58 to O66, wrote the README "Booking" section and made the install skill run the catalog seed.

**How it was directed.** Each iteration was briefed to a Claude Sonnet subagent as a self-contained step: tests first, shown failing, then the minimum code, then the done-when command. Haiku subagents staged and made the commits, one per step. The main agent re-ran the checks itself after each report and read the code the report described before accepting it. No dependencies were added.

**Where it went wrong and how it was caught.**

- The first booking migration was broken: it created only one table. The runs were green because they ran against a database that had been migrated step by step while the migration grew, so the final file had never been applied from nothing. Applying all migrations to a fresh database caught it; the migration was fixed, and the lesson is to apply a schema change to a fresh database before trusting green runs.
- The first foreign keys used `ON DELETE SET NULL` for `seats.hold_id` and `holds.user_id`. Either would have produced a row that violates its own CHECK (a held seat without a hold, a hold without a holder). Caught in review, before any test exercised a delete; changed to `RESTRICT` (O65).
- The seat cap had a race. Two parallel clicks of one holder could both read the old seat count and both pass the cap. The cap integration test with parallel clicks found it. The fix locks the hold row first and counts seats in a second statement (D1).
- Checkout read the clock once, before the payment, so a hold that lapsed while the payment was authorizing was still sold. Caught in review of the checkout service, then fixed test-first: a failing test for two clock reads, then the second read after authorize (D4).
- A commit subagent ran `verify-fast-part` without being asked, which started the local Compose database. It left the local Compose database container (`seatholder-postgres-1`) running, which an unattended run must not touch; it was outside the brief, and later commit briefs forbade running any command except git.
- Prisma blocked `migrate reset` for the agent, as it should for an AI-driven run, so the broken development database was recreated with the run tooling instead of bypassing the guard.
- The integration tests of it-5 (s5) had no separate red run: the tests and the implementation arrived in one step, so the failing run was not recorded. The tests assert the behavior, but the test-first rule was not shown for that step.

**Not yet done.** There is no browser and no UI; the seat map and checkout screens are Phase 3. The sweeper is not scheduled. The full `npm run verify` and the external review have not run at the time of this entry; they run later in this run, and this log does not claim their results (see "Review rounds" below). The install skill, including the catalog seed, has not run on a clean Mac.

**Review rounds.** The external review ran twice through another Agent Manager agent, outside the run that built the phase. The first round found 0 Critical and 3 Important findings: one was fixed and two were dropped with reasons (adopting visitor holds is not a cost on every read, because the `vid` cookie is cleared in the same response; freezing the price on the hold is not needed until prices are editable). It also suggested that the generated Prisma client was tracked, which was wrong: it is gitignored. The second round found 2 Important findings (a docs index and a test gap). At the user's request, all findings and the actionable suggestions were fixed in `7b7f11e` and in the `sweep:holds` commit: `no-store` on release, a voided payment row on `hold_gone`, a fail-fast `buildApp`, a typed invariant error and the sweep command. One of the new tests, the `no-store` check for anonymous release, was a regression guard that passed as soon as it was written, so it has no failing run. The review is then repeated; its result is not claimed here. The decisions are in `DECISIONS.md` O62, O64, O67, O68 and D4.

After the third review round the user asked which options exist for loading the production catalog (the `seed` command refuses production) and chose the catalog-only seed command, from five options (back office only, catalog-only seed, import from file, manual SQL migration, leave empty). `seed:catalog` was added test-first (`seed:catalog` commit, hash not yet known) and verified, including the compiled production entry point `node backend/dist/scripts/seed-catalog.js` (exit 0, the counts on the first run, zeros on a rerun, exit 2 with an argument). The decision is `DECISIONS.md` O69.
