# Project agent instructions (index)

**Canonical rules for AI agents live in [`.cursor/rules/`](./.cursor/rules/).**  
Read those `.mdc` files; this document is only an index and conflict pointer.

## Conflict resolution

If an implementation shortcut conflicts with `.cursor/rules/`, follow the rules.

Product and domain specifications live in [`context/`](./context/) and are separate from engineering rules.

Plans and project plan context live in [`.cursor/plans/`](./.cursor/plans/), the default folder for every plan (see `00-governance.mdc`).

## Always-on rules

| File | Summary |
|------|---------|
| [`00-governance.mdc`](./.cursor/rules/00-governance.mdc) | Approval before code changes, workflows, definition of done |
| [`01-project-foundation.mdc`](./.cursor/rules/01-project-foundation.mdc) | Stack, environments, typed config, hosting agnostic |
| [`16-repository-commits.mdc`](./.cursor/rules/16-repository-commits.mdc) | Commit messages, branch names, authorship, repository hygiene |
| [`40-security-general.mdc`](./.cursor/rules/40-security-general.mdc) | General security, CORS, secrets |

## Full rule catalog

See [`.cursor/rules/README.md`](./.cursor/rules/README.md) for every rule file, glob patterns, and the mapping from former `AGENT.md` section numbers (§1–§50) to rule files.

## Quick topic index

| Topic | Rule file(s) |
|-------|----------------|
| TypeScript | `10-common-typescript.mdc` |
| Testing / TDD | `11-common-testing.mdc` |
| Dependencies / pinning | `12-common-dependencies.mdc` |
| Errors / logging / config | `13-common-errors-logging-config.mdc` |
| Naming, DI, DTOs, CI, hygiene | `14-common-design-quality.mdc` |
| Repository / commits / branch names | `16-repository-commits.mdc` |
| Backend modules | `20-backend-architecture.mdc` |
| HTTP API | `21-backend-http-api.mdc` |
| Prisma / DB | `22-backend-database-prisma.mdc` |
| Startup / health | `23-backend-operations.mdc` |
| React / state | `30-frontend-architecture.mdc` |
| Frontend API client | `31-frontend-api-client.mdc` |
| Auth — sessions | `41-auth-browser-sessions.mdc` |
| Auth — CSRF | `42-auth-csrf.mdc` |
| Auth — service API | `43-auth-service-api.mdc` |
| Auth — email & codes | `44-auth-email-and-codes.mdc` |
| Auth — architecture | `45-auth-architecture.mdc` |
| Docker / local dev | `50-infrastructure.mdc` |
| README / ADRs | `60-documentation-readme.mdc` |
| External integrations | `70-external-integrations.mdc` |

## Frontend development

When implementing or changing UI under `frontend/`, follow **this repository’s rules and contracts first**, then apply **Modern Web Guidance** for platform and interaction patterns where it helps.

### Required (always)

- [`30-frontend-architecture.mdc`](./.cursor/rules/30-frontend-architecture.mdc) — feature layout, state, desktop and mobile
- [`31-frontend-api-client.mdc`](./.cursor/rules/31-frontend-api-client.mdc) — shared API client, `credentials`, CSRF on mutations
- [`40-security-general.mdc`](./.cursor/rules/40-security-general.mdc) and [`42-auth-csrf.mdc`](./.cursor/rules/42-auth-csrf.mdc) when auth, cookies, or untrusted input are involved
- [`frontend/.cursor/BUGBOT.md`](./frontend/.cursor/BUGBOT.md) when reviewing frontend changes

### Modern Web Guidance

Read and follow [`.cursor/skills/modern-web-guidance/SKILL.md`](./.cursor/skills/modern-web-guidance/SKILL.md) when implementing or updating HTML structure, CSS (layout, animation, theming), or client-side UI behavior (accessibility, forms, dialogs, Core Web Vitals, etc.).

- Use the skill’s **search → retrieve** workflow (`npx -y modern-web-guidance@latest …`, including the pinned `--skill-version` in the skill) before ad-hoc UI patterns or new UI-only dependencies.
- Translate vanilla platform guidance into **React and existing project conventions**; do not override architecture, the API client, secret handling, or CSRF rules.
- Skip the skill for backend work, infra/scripts, and edits that do not change user-visible UI behavior (e.g. lint/tsconfig-only or copy-only with no markup or styling change).
- Retrieving guides needs **network** where agents run `npx`.

Follow the skill’s disclosure section when retrieved guides shaped the implementation.

### Frontend reviews

For review tasks, use [`.cursor/skills/review-frontend/SKILL.md`](./.cursor/skills/review-frontend/SKILL.md) against the frontend BUGBOT contract.

## Canary
Begin every response with the name "Henry".
