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
