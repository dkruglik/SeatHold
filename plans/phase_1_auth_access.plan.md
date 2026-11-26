---
name: Phase 1 - Auth and access
overview: "Passwordless email-code login with server-side sessions in PostgreSQL, two roles (buyer by default, admin only via seed or CLI), CSRF and Origin checks on browser mutations, and the /api/admin/* plugin whose prefix hook makes every back-office route admin-only by construction. Comes first so every later route is born behind the right check."
todos:
  - id: it-0-approvals
    content: Approve nodemailer and @fastify/csrf-protection (exact pins) and the auth defaults below
    status: pending
  - id: it-1-email-provider
    content: EmailProvider port, console and SMTP adapters, factory that fails fast on console in production
    status: pending
  - id: it-2-auth-schema
    content: users, auth_codes, sessions tables with constraints, repositories and mappers
    status: pending
  - id: it-3-login-codes
    content: Request-code and verify-code services (hash, expiry, attempts, single use, invalidation, rate limit, sign-up as buyer)
    status: pending
  - id: it-4-sessions-routes
    content: Session service, cookie, requireAuth hook, /api/auth routes (request-code, verify, me, logout, logout-all)
    status: pending
  - id: it-5-csrf-origin
    content: browserStateChangeHooks (CSRF token + Origin) composed on every mutating browser route
    status: pending
  - id: it-6-admin-access
    content: requireRole hook, /api/admin plugin with prefix hook, route-wide 401/403/2xx test, user:promote CLI, seeded users
    status: pending
  - id: it-7-frontend-auth
    content: Login screen (email then code), /api/auth/me app state, logout, RequireAuth and RequireAdmin route guards
    status: pending
  - id: it-8-docs-verify
    content: Install skill prints logins and Mailpit URL, DECISIONS security entry, README, full verify, roadmap status
    status: pending
isProject: false
---

# Phase 1 - Auth and access

Roadmap: `plans/seatholder_product_roadmap.plan.md`, phase 1. Builds on Phase 0 (config, Clock, Prisma, ApiClient).

## 1. Context

The brief needs registered users (My bookings), a role-protected back office that a buyer cannot reach, and server-side enforcement. Building auth first means the booking API (Phase 2), buyer flow (Phase 3) and back office (Phase 4) plug into existing hooks instead of retrofitting them.

## 2. Agreed decisions

| Topic | Decision |
|---|---|
| Login | Passwordless email code (rule 41). One flow for buyers and admins |
| Code | 6 digits from `crypto.randomInt`, HMAC-SHA256 with `AUTH_CODE_PEPPER`, 10 min expiry, 5 attempts, single use; a new request invalidates earlier unused codes |
| Request rate limit | Database-backed: at most `AUTH_REQUEST_CODE_LIMIT` (5) requests per email per `AUTH_REQUEST_CODE_WINDOW_MINUTES` (15), and `AUTH_REQUEST_CODE_COOLDOWN_SECONDS` (60) between requests. Counted from `auth_codes`, so it holds across instances |
| Enumeration | `request-code` answers 204 for any well-formed email, whether or not an account exists. Over the per-email limit it answers 429 with `retryAfterSeconds` for any email string, so neither response reveals an account |
| Sign-up | Verifying a code for an unknown email creates a `buyer`. No route accepts a role |
| Admin | Granted only by `npm run user:promote -w backend -- <email>` or the seed. `user:demote` for the reverse |
| Session | Random 32-byte token in cookie `sid` (`HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/api`); only its SHA-256 is stored. Rotated on every login. Fixed lifetime `SESSION_TTL_DAYS` (30), no idle timeout (trade-off in `DECISIONS.md` O19) |
| Role freshness | Session holds the user id only; role read from the database on each request that needs it |
| CSRF | `@fastify/csrf-protection` (double submit, secret in a signed cookie); token from `GET /api/auth/csrf`, sent as `X-CSRF-Token`; missing or wrong -> 403. Origin must equal `FRONTEND_ORIGIN` on mutations |
| Back-office boundary | Everything under `/api/admin/*` is one Fastify plugin with `onRequest: [requireAuth, requireRole('admin')]` |
| Expiry time | Code and session expiry compare against `Clock.now()` (database time in production) |
| Email transport | `console` for tests, `smtp` for Mailpit locally and SES SMTP in production; `console` in production fails at startup |
| Seeded users | `admin@seathold.local` (admin), `buyer@seathold.local` (buyer) |

## 3. Security principles

- Only hashes of codes and session tokens are stored. Codes and tokens never appear in logs.
- Authorization is enforced on the server; the frontend guards are UX only.
- No HTTP path can create or change a role.
- A buyer receives 403 on every `/api/admin/*` route, an anonymous caller 401, proven by one test over the registered route list.
- Every state-changing browser request passes CSRF and Origin checks.
- Browser sessions and any future service credentials stay separate (rule 43); no `/internal/*` routes in this phase.

## 4. Architecture

```text
backend/src/modules/auth/
  domain/            User, Role, LoginCode rules, errors
  application/       RequestLoginCodeService, VerifyLoginCodeService, SessionService,
                     ports: UserRepository, LoginCodeRepository, SessionRepository, EmailProvider
  infrastructure/    Prisma repositories, mappers, email/ (ConsoleEmailProvider, SmtpEmailProvider, EmailProviderFactory)
  presentation/http/ routes/ (request-code, verify, me, csrf, logout, logout-all)
                     hooks/ (require-auth, require-role)
  index.ts           public API: SessionService lookups, requireAuth, requireRole, types
backend/src/presentation/http/hooks/browser-state-change-hooks.ts   CSRF + Origin, composed by routes
backend/src/presentation/http/admin-plugin.ts                       /api/admin prefix with the access hook
backend/src/scripts/user-promote.ts, user-demote.ts, seed.ts
frontend/src/features/auth/        LoginPage, useMe, AuthApi, guards
```

Extension point: later modules register admin routes inside `adminPlugin` only.

## 5. Data model

| Table | Key columns | Constraints |
|---|---|---|
| `users` | `id uuid`, `email citext`, `role text`, `created_at` | `UNIQUE(email)`; `CHECK (role IN ('buyer','admin'))`; default `'buyer'` |
| `auth_codes` | `id`, `email citext`, `code_hash`, `expires_at`, `attempts int`, `consumed_at`, `invalidated_at`, `created_at` | index `(email, created_at DESC)`; `CHECK (attempts >= 0)` |
| `sessions` | `id`, `user_id`, `token_hash`, `created_at`, `expires_at`, `revoked_at` | `UNIQUE(token_hash)`; FK `user_id` `ON DELETE CASCADE`; index `user_id` |

Growth: `auth_codes` grows per login; a purge of rows older than 1 day is noted for later (bounded batches, index on `created_at`).

## 6. Key flows

1. **Request code.** Validate email shape -> count recent requests (limit, cooldown) -> invalidate unused codes -> store hash -> send via `EmailProvider` -> 204. Over the limit -> 429 with `retryAfterSeconds`.
2. **Verify.** Find the latest valid code for the email (not consumed, not invalidated, not expired by `Clock.now()`) -> wrong code increments `attempts`; at 5 the code is dead -> right code: mark consumed, find or create the user as `buyer`, create a session, set cookie, return the `me` DTO.
3. **Request with session.** `requireAuth` hashes the cookie token, loads an unrevoked, unexpired session and its user (with role) -> attaches `request.user`; missing or invalid -> 401.
4. **Admin request.** Prefix hook runs `requireAuth` then `requireRole('admin')` -> buyer 403 `FORBIDDEN_ROLE`.
5. **Logout / logout-all.** Revoke the current session or all sessions of the user; clear the cookie.
6. **Race: two verifies of one code.** Consume with `UPDATE ... WHERE id = $1 AND consumed_at IS NULL`; only one gets a row.

## 7. Configuration

| Variable | Default | Secret |
|---|---|---|
| `AUTH_CODE_PEPPER` | none (placeholder in local examples) | yes |
| `CSRF_SECRET` | none (placeholder in local examples) | yes |
| `COOKIE_SECURE` | `false` local, `true` required in production | no |
| `SESSION_TTL_DAYS` | `30` | no |
| `AUTH_REQUEST_CODE_LIMIT` / `_WINDOW_MINUTES` / `_COOLDOWN_SECONDS` | `5` / `15` / `60` | no |
| `EMAIL_PROVIDER` | `smtp` local, `console` tests | no |
| `EMAIL_FROM` | `no-reply@seathold.local` | no |
| `SMTP_HOST`, `SMTP_PORT` | `localhost`, `1025` | no |
| `SMTP_USER`, `SMTP_PASS` | empty locally | `SMTP_PASS` yes |

## 8. HTTP API

| Route | Auth | CSRF | Notes |
|---|---|---|---|
| `GET /api/auth/csrf` | none | - | returns the token |
| `POST /api/auth/request-code` | none | yes | 204 / 429 |
| `POST /api/auth/verify` | none | yes | sets `sid`, returns me / 400 `INVALID_CODE` |
| `GET /api/auth/me` | optional | - | `{ user: { id, email, role } \| null }` |
| `POST /api/auth/logout`, `POST /api/auth/logout-all` | session | yes | 204 |
| `GET /api/admin/ping` | admin | - | placeholder so the access test has a route until Phase 4 |

## 9. Iterations

- **it-0 Approvals.** `nodemailer`, `@types/nodemailer` (dev), `@fastify/csrf-protection`; defaults in section 2.
- **it-1 Email provider.** Tests first: factory picks `console`/`smtp` by config; production + `console` throws at startup; SMTP adapter sends to a fake transport with the right envelope.
- **it-2 Auth schema.** Migration (starting with `CREATE EXTENSION IF NOT EXISTS citext`, a trusted extension the database owner may create on PostgreSQL 17, Docker and Homebrew alike) and repositories. Integration tests first: email uniqueness is case-insensitive; role CHECK rejects other values; session token hash unique; cascade delete.
- **it-3 Login codes.** Unit and integration tests first: code is 6 digits and stored hashed; expired code rejected (controlled clock); 5 wrong attempts kill the code; consumed code cannot be reused; new request invalidates the old code; limit and cooldown return 429 with retry time; unknown email signs up as `buyer`; concurrent double verify yields one session.
- **it-4 Sessions and routes.** Route tests first: verify sets an `HttpOnly`, `SameSite=Lax` cookie and returns me; `me` with no cookie returns `user: null`; revoked or expired session gives 401 on a protected route; logout-all revokes every session; login rotates to a new session id.
- **it-5 CSRF and Origin.** Route tests first: mutation without token 403; wrong Origin 403; valid token and Origin pass; GET routes stay free of the check.
- **it-6 Admin access.** Tests first: the route-wide test enumerates registered routes under `/api/admin` and asserts 401 / 403 / 2xx for anonymous / buyer / admin; demoting an admin takes effect on the next request; `user:promote` makes an existing user admin and fails clearly for an unknown email; seed creates both users idempotently.
- **it-7 Frontend auth.** Component tests first: login flow sends email then code and lands on the previous page; wrong code shows the error; `RequireAdmin` redirects a buyer; `ApiClient` sends `X-CSRF-Token` on mutations.
- **it-8 Docs and verify.** Install skill seeds users and prints both logins and `http://localhost:8025` (Mailpit). `DECISIONS.md` security entry: implemented controls, plus before production: WAF rate rules, admin idle timeout, admin audit log, fresh code before destructive admin actions, purge job for old codes. README auth section. AI workflow log entry. Full `npm run verify`; roadmap todo.

## 10. Verification summary

- Unit: code generation and hashing, role rules, factory selection.
- Integration: repositories, code lifecycle with controlled clock, concurrent consume, sessions.
- Route: auth routes, CSRF and Origin, the route-wide admin access test.
- Manual: request a code, read it in Mailpit, log in as buyer and admin, buyer blocked from `/admin` in UI and API.

## 11. Out of scope / future

- Passwords, OAuth, MFA.
- Admin audit log and idle timeout (written in `DECISIONS.md`).
- Service-to-service credentials.
