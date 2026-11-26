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
