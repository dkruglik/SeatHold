---
name: Phase 6 - Design system depth
overview: "Deepens the component layer once everything else is solid: a SeatHolder theme beyond Mantine defaults, shared UI wrappers, extra behaviour on the DateTimeRangePicker and the SeatMap that Mantine does not offer, and a desktop and mobile pass on every screen. First phase to cut if time runs out; optional extras only after it."
todos:
  - id: it-0-approvals
    content: "Approve the theme direction and the component extensions below (no new dependencies expected); plan defaults used as written, no person confirmed them"
    status: completed
  - id: it-1-theme-and-ui-layer
    content: Theme depth beyond the Phase 3 base theme (spacing and typography scale, dark scheme), shared ui wrappers (7b870e2)
    status: completed
  - id: it-2-picker-extensions
    content: DateTimeRangePicker presets, timezone label, validation messages, full keyboard support (f7c803f)
    status: completed
  - id: it-3-seat-map-extensions
    content: SeatMap legend, row labels, price and state tooltip, keyboard navigation, zoom and pan on small screens (d8203ea)
    status: completed
  - id: it-4-responsive-pass
    content: "Desktop and mobile layout on every screen (discovery, event, checkout, tickets, guest, admin) (3a1ae01); phones and other browsers an accepted limit (desktop Chrome only, 2026-11-27)"
    status: completed
  - id: it-5-optional-extras
    content: Optional - one item from brief section 5 if time remains (for example SSE seat updates or a per-buyer ticket limit); not built, cut (O121)
    status: completed
isProject: false
---

# Phase 6 - Design system depth

Roadmap: `plans/seatholder_product_roadmap.plan.md`, phase 6. Builds on the components started in Phase 3.

## 1. Context

The brief asks for an own component layer on a base library, themed and extended with behaviour the library lacks, with the DateTimeRangePicker and SeatMap as the two required extensions. Phase 3 delivered working versions; this phase makes the theme and the extensions clearly our own and checks every screen on desktop and mobile.

## 2. Agreed decisions

| Topic | Decision |
|---|---|
| Base | Mantine; our components live in `frontend/src/shared/ui/` and features import only from there |
| Theme | Phase 3 ships the base theme (palette, font stack, radius); this phase adds the spacing and typography scale and the dark scheme |
| Picker extensions | Presets (Tonight, This weekend, Next 7 days, Next 30 days), time zone label (browser zone by default, optional zone prop; venue-local filtering not built, O118), inline validation (`to` before `from`, past ranges), keyboard: arrows move days, Tab moves between from/to date and time |
| Seat map extensions | Legend for the four states, row labels on both sides, tooltip with seat, price and state, roving-tabindex keyboard navigation (arrows move, Enter or Space holds/releases), pinch zoom and pan on small screens, focus kept after polling refresh |
| Accessibility | Each seat has an accessible name and state; colour is never the only signal (pattern or icon for held and sold) |
| Responsive | Breakpoints from the theme; every screen usable at 360 px width and on desktop (rule 30) |

## 3. Security principles

No change to trust boundaries; UI work only. Nothing sensitive is added to client storage.

## 4. Architecture

```text
frontend/src/shared/ui/
  theme.ts, index.ts
  date-time-range-picker/   presets, timezone label, keyboard handling, tests
  seat-map/                 legend, tooltip, keyboard navigation, zoom-pan, tests
  (Button, Card, FilterBar, PageLayout wrappers)
```

## 5. Data model

None.

## 6. Key flows

1. Picker: open -> pick a preset or a range and times -> validation feedback -> apply -> URL updates.
2. Seat map: Tab into the map -> arrows move between seats -> Enter holds -> the countdown starts; polling refresh keeps focus and selection.
3. Mobile: the map fits the width, pinch to zoom, tap to hold; checkout panel docks at the bottom.

## 7. Configuration

None.

## 8. HTTP API

None.

## 9. Iterations

- **it-0 Approvals.** Theme direction and extension list in section 2.
- **it-1 Theme and UI layer.** Tests first: features render through the wrappers; dark scheme toggles; no direct `@mantine/core` imports in `features/` (lint rule or test).
- **it-2 Picker extensions.** Tests first: each preset sets the right instants for a controlled "now"; timezone label shown; invalid ranges show messages; keyboard navigation moves days and fields.
- **it-3 Seat map extensions.** Tests first: legend matches states; arrow keys move focus across rows and seats; Enter or Space toggles hold; focus survives a polling refresh; tooltip shows seat, price and state.
- **it-4 Responsive pass.** Tests first where practical (render at narrow width); manual check of every screen at 360 px and desktop.
- **it-5 Optional extras.** Only after it-1 to it-4; pick one, plan it as its own small iteration, and list the rest under "what was cut" in the README.

## 10. Verification summary

- Component tests for presets, validation, keyboard behaviour and focus handling.
- Manual: every screen on a phone-size viewport and on desktop, keyboard-only purchase.

## 11. Out of scope / future

- Storybook or a showcase page (the brief says not needed).
- Canvas rendering, general admission areas, venue-specific seat layouts.
