# Release guide: Phase 5 deliverables (final README, install skill, `/api/auth/me` never cached)

Branch: `feature/phase-5-deliverables` · MR: not opened yet · Plan: `plans/phase_5_deliverables.plan.md` it-1 to it-4 · Date: 2026-11-27

Deploy order: Phases 1 to 4 first (guides [phase-1-auth-access.md](phase-1-auth-access.md), [phase-2-booking-core.md](phase-2-booking-core.md), [phase-3-buyer-flow.md](phase-3-buyer-flow.md), [phase-4-back-office.md](phase-4-back-office.md)). This guide does not repeat their steps.

Placeholders used below: `<site-origin>` (the public https origin, the same value as `FRONTEND_ORIGIN`), `<admin-email>` or `<buyer-email>` (a mailbox you can read, for the signed-in check) and `<host>` (the host part of `<site-origin>`). The README has no AWS commands and this repository holds no AWS names, so every AWS-specific step is marked `TODO(operator)`.

## What changes for users

Nothing visible. The only runtime change is that `GET /api/auth/me` now answers `Cache-Control: no-store` and `Vary: Cookie`, for an anonymous browser and for a signed-in user. Before, the answer carried no cache header, so a shared cache could in theory reuse one person's answer for another. The rest of the branch is documentation and tooling: the final `README.md` (quick start, architecture page, what was cut), the decision entries `DECISIONS.md` O111 to O114 (cache headers, latency, scale, own KPI), the AI workflow record, and the `install-seathold` skill with a static check (`scripts/install-skill-check.mjs`, `scripts/install-skill.test.mjs`) that compares the skill's commands with the repository.

Nothing is switched by a flag. Details: `README.md` ("Quick start", "Install skill", "What was cut"). Decisions: `DECISIONS.md` O111 to O114.

## Before deploy

1. Release Phases 1 to 4 first if they are not live (see the header).
2. No environment variables, no secrets and no migrations change (see below).

### Environment variables

None. This release adds no variable and changes no default (`.env.example` and the config module are untouched). No new secrets. Nothing for the secret store.

### Other requirements

1. `GET /api/auth/me` is under `/api`, so the existing `/api/*` CloudFront behaviour covers it. TODO(operator): confirm the CloudFront cache policy for `/api/*` honours the origin `Cache-Control` and forwards `Cookie`, as asked in the earlier guides ([phase-3-buyer-flow.md](phase-3-buyer-flow.md) and [phase-4-back-office.md](phase-4-back-office.md), "Other requirements"). The check below proves it.
2. The frontend is not changed. No frontend release is needed.

## Deploy

Backend only. Use the same release as for earlier phases.

```bash
docker build -f backend/Dockerfile -t seatholder-backend .
```

TODO(operator): the backend release command (the README gives no AWS commands).

### Migrations

None. This release adds no migration. The schema is untouched.

No manual data steps.

## After deploy: check the feature

Set the shell variables once (placeholders from the header):

```bash
SITE='<site-origin>'
USER_JAR="$(mktemp)"
```

### 1. The backend started

```bash
curl -s "$SITE/api/health"
echo
```

Expected: `{"status":"ok"}`. No variable is new, so a startup failure is not about this release: read the task log for `Invalid configuration: <VARIABLE> ...`. TODO(operator): the log-group name and the command to tail it.

### 2. `/api/auth/me` headers, anonymous (read-only)

```bash
curl -sI "$SITE/api/auth/me" | grep -iE '^(HTTP|cache-control|vary|x-cache|age)'
curl -s "$SITE/api/auth/me"
echo
```

Expected: `HTTP/... 200`, `cache-control: no-store`, a `vary` line that includes `Cookie`, and the body `{"user":null}`. If `cache-control` is missing or different, the old backend is still serving: check that the new image is deployed.

### 3. `/api/auth/me` headers, signed in (read-only after login)

**Action:** logs in as `<buyer-email>`. It creates one `users` row if the address is new, and one `sessions` row. Safe: both addresses are yours, and the limit is 5 code requests per 15 minutes per address. Use the same commands as the Phase 1 guide, steps 3 to 5 ("A CSRF token is issued", "Request a login code", "Log in with the code"), with `JAR="$USER_JAR"` and `TEST_EMAIL='<buyer-email>'`. Then:

```bash
curl -sI -b "$USER_JAR" "$SITE/api/auth/me" | grep -iE '^(HTTP|cache-control|vary|x-cache|age)'
curl -s -b "$USER_JAR" "$SITE/api/auth/me" | head -c 300
echo
```

Expected: `200`, `cache-control: no-store`, `vary` including `Cookie`, and a body with `"user":{...}` for your account.

### 4. CloudFront does not serve it from cache

Read-only. Call it twice and compare. Replace nothing; `<host>` is already in `$SITE`.

```bash
for i in 1 2; do curl -sI -b "$USER_JAR" "$SITE/api/auth/me" | grep -iE '^(x-cache|age|via)'; echo "--"; done
curl -sI "$SITE/api/auth/me" | grep -iE '^x-cache'
```

Expected: no `age` header, and `x-cache` is `Miss from cloudfront` or `Error from cloudfront`, never `Hit from cloudfront` and never `RefreshHit from cloudfront`. Anonymous and signed-in answers differ (`{"user":null}` against your user) on every call. If a hit appears, stop: the cache policy ignores the origin header. Fix the policy (`TODO(operator)` in "Other requirements") or roll back and report it. No `x-cache` header at all means the request did not go through CloudFront: tell the operator which path was used.

### 5. Clean up the test session

**Action:** deletes only the local cookie jar. The test session expires by itself; log out in a browser to end it earlier.

```bash
rm -f "$USER_JAR"
```

### SQL checks

None. No table, column or row is touched by this release apart from the test login in step 3.

### Scheduler checks

None. This release adds no background job, queue or schedule.

## Rollback

Revert the commit and redeploy the previous backend image:

```bash
git revert 206d131
```

Then redeploy as in "Deploy". The change only adds two response headers on one route, so there is no data change, no migration to undo and no variable to remove. After the rollback `GET /api/auth/me` has no `cache-control` header again (the old behaviour). The documentation and tooling changes need no rollback.

## Known limits

- The timed clean-Mac run of the `install-seathold` skill has not been done. The skill is written and statically checked only (its commands are compared with `package.json`, `.env.example` keys and repository paths). TODO(operator): a person runs the skill on a clean Mac, notes the minutes (target: under 10) and every fix needed, and records them in `docs/ai-workflow-log.md`.
- The manual end-to-end run for a buyer, a guest and an admin has not been done in a real browser. The frontend has jsdom component tests and the backend has integration tests only. TODO(operator): run the demo path from `README.md` ("Demo path in five lines") in a browser as buyer, guest and admin, and record the result in `docs/ai-workflow-log.md`.
- No cache layer exists: no CloudFront configuration is in the repository. The latency targets, the scale design and the KPI query (O112 to O114) are written, not measured or built.
- The GitHub Actions workflow has not run on this branch.
- Open `TODO(operator)` lines above: the CloudFront cache policy for `/api/*`, the backend release command, the log-group name and tail command, the clean-Mac skill run, and the browser end-to-end run.
- README: "Quick start", "Install skill" and "What was cut" in `README.md`. Decisions: DECISIONS.md O111 to O114.
