---
name: Phase 5 - Deliverables
overview: "Turns the running system into the submission: the install-seathold skill verified on a clean Mac in under 10 minutes, a README that runs the system without the skill and says what was cut, the remaining DECISIONS.md entries (caching, latency, scale on AWS, own KPI) checked against the code, and the AI workflow section with one real example where Claude was wrong."
todos:
  - id: it-0-approvals
    content: Confirm the own KPI default (hold-to-purchase conversion and hold expiry rate) and the latency targets below. Used as written, recorded in DECISIONS O111-O114; no person confirmed them
    status: completed
  - id: it-1-install-skill
    content: "install-seathold complete - prerequisites, Homebrew services, install, migrate, seed, start, health wait, URLs and logins; static check (917be0a). The timed clean-Mac run was skipped by the owner decision on 2026-11-27 (no Mac available; accepted risk)."
    status: completed
  - id: it-2-readme
    content: README final - what it is, run on Windows (Docker) and Mac (Homebrew) without the skill, scripts, tests, what was cut
    status: completed
  - id: it-3-decisions
    content: DECISIONS caching, latency, scale (100,000 visitors / 20,000 seats on AWS), own KPI; every entry cross-checked with the code
    status: completed
  - id: it-4-ai-workflow
    content: AI workflow section from the log - Claude setup, review loop, one real wrong-output example and how it was caught
    status: completed
  - id: it-5-final-verify
    content: "Roadmap statuses. Manual end-to-end for buyer, guest and admin run by the repository owner in desktop Chrome on 2026-11-27. GitHub Actions passed on main after the merges (owner-confirmed, 2026-11-27)."
    status: completed
isProject: false
---

# Phase 5 - Deliverables

Roadmap: `plans/seatholder_product_roadmap.plan.md`, phase 5. Phases 0-4 already wrote decisions 1, 2, 4, 5, 6 and the security entry next to their code.

## 1. Context

The brief's deliverables are the working system, the install skill, `README.md`, `DECISIONS.md` (six decisions, written KPIs, AI workflow) and `CLAUDE.md`, in a public repository with real history. This phase closes the entries that have no code of their own and proves the install path on a clean Mac.

## 2. Agreed decisions

| Topic | Decision |
|---|---|
| Install path | Homebrew on macOS (rule 50 exception): `node@24`, `postgresql@17`, `mailpit` as `brew services`; same `.env` keys as Docker Compose |
| Install proof | One timed run on a clean macOS user or VM; the time and any fix go into the AI workflow log |
| Latency targets (written) | Search `GET /api/shows` p95 < 150 ms server time at seed size; seat hold p95 < 50 ms; checkout p95 < 200 ms excluding the payment provider. Threats: the hold transaction itself (clock read, expire a stale hold, insert or reuse the hold, update the seat: nine round trips for an anonymous holder, ten for a signed-in one (counted from the code, DECISIONS O112)), hot seat rows at on-sale, polling load, connection-pool exhaustion behind RDS Proxy, full-text query plans |
| Caching (written, decision 3) | Cache: show search results per normalized query for 30 s, facets for 5 min, event detail for 60 s (CloudFront / app); public seat availability per event for 1-2 s at CloudFront. Invalidate on admin event create and price change. Never cache: holds, `held_by_me` state, checkout, payments, sessions, My bookings, guest pages, admin responses |
| Scale (written) | 100,000 visitors for 20,000 seats: first to break is the seat-hold write path (row contention and connection pool), then polling reads on the writer and the session lookup per request. Changes: virtual waiting room at CloudFront to meter entry, read replica for search and facets, seat-map availability cached 1-2 s, RDS Proxy, ElastiCache for sessions (needs approval), hold attempts per buyer limited. AWS: CloudFront, WAF, S3, ALB, ECS Fargate (auto scaling), Aurora PostgreSQL with replica, RDS Proxy, SES, Secrets Manager, CloudWatch, EventBridge Scheduler |
| Own KPI (default, used as written in it-0; no person confirmed it) | Hold-to-purchase conversion and hold expiry rate per event (shows whether the 10-minute window and checkout UX work, and detects hoarding). Alternatives: p99 time from click to `held_by_me`; ticket QR fetch success rate |
| Measured latency | Optional, only if time remains: a short `autocannon` run noted in `DECISIONS.md` (dependency would need approval) |

## 3. Security principles

- README and `DECISIONS.md` hold no secrets, hostnames, emails or real connection strings (rule 60).
- The install skill never prints secrets; it generates local secrets into `.env` and prints only URLs and seeded logins.

## 4. Architecture

Documentation and skill only:

```text
.claude/skills/install-seathold/SKILL.md
README.md
DECISIONS.md
docs/ai-workflow-log.md
```

## 5. Data model

None.

## 6. Key flows

1. **Install skill.** Check macOS and architecture -> Xcode command line tools -> Homebrew (non-interactive install if missing) -> `brew install node@24 postgresql@17 mailpit` -> `brew services start` both -> create role and database if missing -> create `.env` from the example with generated local secrets -> `npm ci` -> `npm run db:migrate:deploy` -> `npm run db:seed` -> start backend and frontend in the background with logs -> wait for `/api/health` -> print `http://localhost:5173`, `http://localhost:8025`, `admin@seathold.local`, `buyer@seathold.local`, and how to stop.
2. **Re-run.** Every step is idempotent: existing installs, services, role, database and `.env` are kept.
3. **Failure.** Each step reports what failed and the command to fix it, then stops.

## 7. Configuration

None new. The skill fills `.env` from `.env.example` and generates `AUTH_CODE_PEPPER` and `CSRF_SECRET` locally.

## 8. HTTP API

None.

## 9. Iterations

- **it-0 Approvals.** Confirm the own KPI default recorded in `DECISIONS.md` or replace it there; confirm the latency targets and caching list.
- **it-1 Install skill.** Check: a scripted dry run on Windows is not possible, so the proof is the timed clean-Mac run; record time and fixes. Also a static check in `scripts/` that the skill's commands exist in `package.json`.
- **it-2 README.** Every command listed exists (rule 60); "what was cut" lists anything dropped from Phases 3-6.
- **it-3 DECISIONS.** For each entry, cite the file or test that implements it; entries 1, 2, 4, 5, 6 and security re-read against the final code; add caching, latency, scale, own KPI, and the back-office proposal.
- **it-4 AI workflow.** From `docs/ai-workflow-log.md`: how Claude was set up (rules, skills, review agents, test first), how output was reviewed, one concrete example where Claude was wrong (what, how caught, what changed).
- **it-5 Final verify.** Full `npm run verify` on the final commit; manual end-to-end: buyer and guest from search to QR, admin creates an event, buyer blocked from admin; roadmap todos set.

## 10. Verification summary

- Clean-Mac timed run of the install skill (< 10 min).
- Full verify green on the final commit.
- Manual end-to-end for all three roles.
- Document review: every `DECISIONS.md` entry points at matching code.

## 11. Out of scope / future

- Real AWS deployment and infrastructure-as-code.
- Load testing beyond an optional short run.
