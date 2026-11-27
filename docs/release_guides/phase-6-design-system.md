# Release guide: Phase 6 design system (range picker presets, seat map keyboard and zoom, dark scheme, phone layout)

Branch: `feature/phase-6-design-system` · MR: not opened yet · Plan: `plans/phase_6_design_system.plan.md` it-1 to it-4 · Date: 2026-11-27

Deploy order: Phases 1 to 5 first (guides [phase-1-auth-access.md](phase-1-auth-access.md), [phase-2-booking-core.md](phase-2-booking-core.md), [phase-3-buyer-flow.md](phase-3-buyer-flow.md), [phase-4-back-office.md](phase-4-back-office.md), [phase-5-deliverables.md](phase-5-deliverables.md)). This guide does not repeat their steps. This release is frontend only.

Placeholders used below: `<site-origin>` (the public https origin, the same value as `FRONTEND_ORIGIN`) and `<host>` (the host part of `<site-origin>`). The README has no AWS commands and this repository holds no AWS names, so every AWS-specific step is marked `TODO(operator)`.

## What changes for users

Every screen looks and behaves the same as before in function, with these visible changes.

- **Date and time range picker** (Discovery filter): presets Tonight, This weekend, Next 7 days and Next 30 days, a "Times in ..." time zone label, and inline messages "End must be after start" and "This range is already over". Escape closes the popover and returns focus to the trigger.
- **Seat map**: keyboard navigation (Tab to one seat, arrows to move, Home and End, PageUp and PageDown, Enter or Space to hold), a tooltip with row, seat, price and state on hover or focus, row labels on both sides, and zoom, pan and pinch on small screens. Focus stays on the same seat across a polling refresh.
- **Dark scheme**: a light, dark and auto toggle in the header. The choice is kept in the browser's local storage on that device only.
- **Phone layout (360 px and up)**: every screen has one h1 and a single column. On the event page the checkout panel sits below the map, and a sticky bar at the bottom shows the countdown and "Continue to payment". The account area folds into one menu button, the release dialog is full screen and buttons and the pager have large touch sizes.

Nothing is switched by a flag. Details: `README.md` ("Frontend and UI"). Decisions: `DECISIONS.md` O116 to O121.

## Before deploy

1. Release Phases 1 to 5 first if they are not live (see the header).
2. No environment variables, no secrets and no migrations change (see below). The backend is not changed and needs no release.

### Environment variables

None. This release adds no variable and changes no default (`.env.example` and the backend config module are untouched; the frontend build has no new `VITE_` variable). No new secrets. Nothing for the secret store.

### Other requirements

1. The build is a static Vite build (`frontend/dist`). The existing SPA fallback for `/admin`, `/bookings` and `/events/<id>` must still be in place (asked in [phase-4-back-office.md](phase-4-back-office.md), "Other requirements"). TODO(operator): confirm it.
2. Keep the previous `frontend/dist` (or its object-store version) so the rollback is a redeploy.

## Deploy

Frontend only. Build it from the repository root.

```bash
npm ci
npm run build -w frontend
```

Expected: `tsc --noEmit` and `vite build` finish without errors and `frontend/dist` exists.

Then upload `frontend/dist` to the static host. TODO(operator): the upload command and the CloudFront invalidation command (the README gives none; see [phase-4-back-office.md](phase-4-back-office.md), "Deploy"). The invalidation must cover `/index.html` at least, so browsers load the new hashed assets.

### Migrations

None. This release adds no migration. The schema is untouched.

No manual data steps.

## After deploy: check the feature

Use a private browser window, so no cached build or stored scheme is used. Replace `<site-origin>` with the public origin (it is a browser address, nothing to paste into a shell except the first check).

### 1. The site is served and the backend is still healthy

```bash
curl -s "<site-origin>/api/health"
echo
curl -sI "<site-origin>/" | grep -iE '^(HTTP|content-type)'
```

Expected: `{"status":"ok"}`, then `HTTP/... 200` and `content-type: text/html`. If the page is the old build, the invalidation has not finished: wait and retry.

### 2. Pages load on a desktop

Open each address in the browser and read the console (dev tools, Console tab).

1. `<site-origin>/` (Discovery)
2. `<site-origin>/events/<id>` (open any event from Discovery)
3. `<site-origin>/bookings` (signed in; otherwise the login page)
4. `<site-origin>/admin` (signed in as an admin; a buyer gets the access-denied screen)

Expected: each page renders with one h1 and no red console errors. A reload of each address directly (not through a link) also renders; a 403 or 404 from the host means the SPA fallback is missing.

### 3. Pages load on a 360 px viewport

Open dev tools, switch on device mode and set the width to 360 px. Repeat the four addresses.

Expected: no horizontal page scroll, the account area is one menu button, and on `/events/<id>` the checkout panel is below the seat map with a sticky bar at the bottom (countdown and "Continue to payment" once seats are held). `/admin` lists and dialogs fit the width; the release dialog is full screen.

### 4. Keyboard-only seat hold

**Action:** holds one seat on a real event for the signed-in or guest session; it expires by itself after the hold window, or release it with the page's release button. Safe: one seat, released right after.

1. Open `<site-origin>/events/<id>`.
2. Press Tab until the seat map takes focus (a seat shows the focus ring).
3. Move with the arrow keys; Home and End jump to the row ends.
4. Hover or focus a seat: the tooltip shows row, seat, price and state.
5. Press Enter on an available seat.

Expected: the seat becomes held with the countdown running, with no mouse used. A seat already taken answers with the conflict message and stays unselected. Release the seat afterwards.

### 5. Dark toggle persists

1. Use the colour scheme toggle in the header and pick Dark.
2. Reload the page.

Expected: the page is dark after the reload and the toggle shows Dark. Pick Auto to follow the system again. See the known limit on the first paint below.

### 6. Range picker presets

On Discovery open the date range control and pick "Next 7 days".

Expected: the label "Times in <zone>" shows, the list filters, and a past range typed by hand shows "This range is already over".

### SQL checks

None. No table, column or row is touched by this release.

### Scheduler checks

None. This release adds no background job, queue or schedule.

## Rollback

Redeploy the previous static build and invalidate the CDN again. TODO(operator): the same upload and invalidation commands as in "Deploy", pointed at the previous build. Or revert the branch and rebuild:

```bash
git revert --no-edit 99b89c7 2a76c12 3a1ae01 7b870e2 d8203ea f7c803f
npm ci
npm run build -w frontend
```

There is no data change, no migration to undo and no variable to remove. A visitor's stored colour scheme in local storage is harmless to the old build.

## Known limits

- The dark preference can flash one light frame on the first paint of a reload, because `index.html` has no `ColorSchemeScript` (DECISIONS O117). TODO(operator): decide whether to accept it or add the script in a later change (it needs a real-browser check).
- Pinch and pan on the seat map are tested only with synthetic pointer events in jsdom (O119). TODO(operator): a person tries pinch, drag and the Zoom in, Zoom out and Reset view buttons on a real phone and records the result in `docs/ai-workflow-log.md`.
- Real tap target sizes are unverified: jsdom has no layout, so the tests prove which components render at a width, not that they fit 360 px (O120). The real-device check above covers it.
- Text inputs and selects keep their default size and inline links are not enlarged (O120).
- The Discovery date filter uses the browser's time zone, not the venue's (O118); the picker shows the zone in its label.
- Live seat updates and a per-buyer ticket limit were cut (O121); seats still refresh by polling.
- The GitHub Actions workflow has not run on this branch.
- Open `TODO(operator)` lines above: the SPA fallback check, the upload and CloudFront invalidation commands, the first-paint decision and the real-device check on a phone.
