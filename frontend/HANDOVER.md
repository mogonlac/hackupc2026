# SLAP frontend — handover

You are picking this up from Claude Code. This document is the full diff of intent
between the codebase you would have inherited and the codebase you are looking at
now. Read this before touching anything; the structural choices below are
load-bearing for everything that comes next.

## What changed in the most recent round

The user's previous critique was: *trends look flat, resolve speed isn't a clear
strength signal, the graphs don't tell a useful story, and there's no per-request
timing on the member page.* All four are now addressed.

1. **Database regenerated with a deliberate story** — see
   `scripts/generate-db.mjs`. Each dept has a profile (overworked, mixed,
   maldistributed, healthy, spike, underused) and the seeded RNG produces
   volumes / complexities / ages / resolve times that match. The result:
     - **Sales** — 9/9 in score 4–5, 142 pending, 64 items >14 days old.
     - **Engineering** — mixed, 5/8 over.
     - **Data Science** — maldistributed (one rockstar at 4, three at 1–2).
     - **Operations** — recent incident spike (max age 3.9d, 48 pending).
     - **Marketing** — healthy, balanced.
     - **Product** — clear capacity (9 pending, 84 resolved).
   All `created_at` / `finished_at` end at 2026-04-25 so the 14-day window
   is fully populated. Run `node scripts/generate-db.mjs` to reproduce.
2. **Sparklines now show real curves** — they were flat because the previous
   data ran Jul–Aug 2026 but `now` is today; the regen anchors timestamps
   at today.
3. **Throughput became the headline metric.** "AVG RESOLVE (h/c)" was opaque
   and the values were almost identical, so it's been demoted to a secondary
   stat. The new headline is **CLOSED · 7D** — items resolved in the last
   seven days. It now appears on Company stat strip, Dept stat strip, the
   per-member dept table, and the Member stat strip. Resolve h/c stays on
   each strip as a secondary signal with a tooltip explaining what it is.
4. **Graphing panel is tabbed:** Workload · Throughput · Aging · Balance.
     - **Workload** — the previous stacked bar chart.
     - **Throughput** — two-line chart, *created* (orange) vs *resolved*
       (green) per day, last 14 days. Crossover answers "is this dept
       digging out?" at a glance. Headline shows the 14-day net
       (`closed N more than created` / `created N more than closed`).
     - **Aging** — horizontal stacked bars per dept (or per member at lower
       levels) bucketed `<1d / 1–3d / 3–7d / 7–14d / 14d+`. The red tail
       is the unignorable backlog.
     - **Balance** — the previous load-balance gauge + 5-bucket
       distribution.
   Active tab is persisted via `usePersistedState`.
5. **MemberView request tables** got three new columns:
   **Created · Started · Completed · Time spent**. Time spent is
   `processHours` if present, else `finished - started`, formatted
   "1d 4h" / "2h 15m". Pending items show `—` for Completed/Time spent.
6. **Scoring extensions** — `computeScores` now also exposes
   `dailyResolved14`, `dailyCreated14`, `aging` (5 buckets), and
   `throughput7d` per dept, per company, and `throughput7d` per member.
   Helpers `buildDailyResolved`, `buildDailyCreated`, `buildAgingBuckets`,
   `countResolvedSince` live alongside the existing `buildTrend14`.
   Constants `AGING_LABELS` and `AGING_COLORS` are exported.
7. **GraphingPanel API is `view={...}`** — App's `buildView({ nav, data,
   currentDept, currentMember })` returns the per-tab payload. Keep that
   helper as the single fan-out point.
8. **Tests extended** — `npm test` now also pins the shapes of the new
   series and asserts that `aging.sum() === pendingTotal`. 14 assertions,
   green.
9. New components: `AgingChart.jsx`, `ThroughputChart.jsx`. Both are
   pure-SVG, no deps.
10. New format helpers: `fmtDuration(ms)` and `durationBetween(a, b)` in
    `utils/format.js`.

Bundle is now 482 KB (108 KB gzip) — about +23 KB for the bigger DB and
the new charts. Still no runtime deps beyond React.

----- below: original handover from the prior round -----


## What SLAP is

A workforce-burden dashboard. `db.json` is the single data source. `scoring.js`
ranks every person 1–5 (cool = under, green = balanced, warm = over) by blending
open volume, mean pending complexity, and mean age of open work, then averages
to dept and company. Three drill-down levels (Company → Department → Member)
plus a separate **Attention** triage view. Two collapsible bottom drawers
(**Graphing**, **Live Requests**) sit above an Excel-style tab bar.

## Why this commit exists

The previous state had the right product idea but several soft spots:

1. Layout constants drifted (`TABBED_BOTTOM = 40` in `App.jsx` vs `32` in
   `LiveRequestsPanel.jsx`) — caused subtle overlap / gap between panels.
2. README documented one colour palette, code shipped another.
3. App-level company aggregation duplicated `computeScores`’ aggregation.
4. `view ∈ {'org','attention'}` plus a `navStack` were two parallel state
   machines kept in sync by hand.
5. `MemberView` could crash on a stub member with no `requests` field.
6. `AttentionView` and `LiveRequestsPanel` used different sources for "now",
   producing different staleness numbers in the same render.
7. A 30-second `tock` interval forced a full recompute of static data.
8. Inline-styles were repeated dozens of times; no theme tokens.
9. No URL routing, no persisted UI prefs, no a11y, no tests.
10. Dead Vite scaffold (`App.css`, `assets/hero.png`, `react.svg`, `vite.svg`).

All ten are addressed below.

## What changed (file by file)

### New utilities

- **`src/utils/theme.js`** — design tokens: colour palette, font stacks,
  `TNUM` (tabular numerals), `LABEL`, `STAT_VALUE`, `TABLE_BASE/TH/TD`,
  panel-header gradient. Components import these instead of redefining
  inline styles.
- **`src/utils/layout.js`** — single source of truth for every layout
  constant: `TAB_BAR_H = 32`, `PANEL_HEADER_H = 30`, `TOP_BAR_H = 40`,
  `PANEL_MIN_H/MAX_H`, `Z` index map, `clampPanelH` helper. **Every
  layout calculation in `App.jsx` and the panels reads from here.** This
  killed the 32-vs-40 drift bug.
- **`src/utils/format.js`** — `fmtResolveSpeed`, `fmtTimestamp`,
  `fmtTimestampLong`, `fmtDateHeader`, `fmtRelative`, `initials`. The
  three components that used to redefine these now import them.
- **`src/utils/nav.js`** — discriminated nav union and hash codec:
  ```
  { kind: 'company' } | { kind: 'attention' } |
  { kind: 'dept', deptId } | { kind: 'member', deptId, memberId }
  ```
  Plus `navToHash`, `hashToNav`, `navStack`, `popNav`, `navsEqual`. The
  hash is the URL of record — refresh and back/forward work.
- **`src/utils/persist.js`** — `usePersistedState(key, initial)` writes
  to `localStorage` under the `slap.` namespace. Used for panel
  open/closed, panel heights, and Live Request filters / sort keys.

### Updated `src/utils/scoring.js`

- `computeScores` now returns `visibleDepartments` directly (the visible
  vs. hidden filter — `HIDDEN_COMPANY_DEPT_IDS` — lives entirely here),
  killing the duplicate `dataForCompanyView` aggregation that used to
  live in `App.jsx`.
- Each dept and the company aggregate gain a `trend14: number[14]` field:
  daily open-item count for the last 14 days, used by the new sparklines.
  Built from existing `created_at` / `finished_at`, no schema change.
- `normaliseRequest` is idempotent (`__normalised` flag) so
  `AttentionView`’s old double-normalise is safe.
- The `!pre` defensive branch now returns a member with empty
  normalised `requests`, so `MemberView.requests.filter(...)` no longer
  crashes on stub members.
- Added `distribution(members)` → `[c1, c2, c3, c4, c5]` for the load-
  balance panel.
- Added `heatColorForFraction(t)` and `heatColorForResolve(value, all)`
  — used by `CompanyView` and `DepartmentView` to heat the Pending and
  Resolve columns.
- `SCORE_COLORS` / `SCORE_LABELS` are now the **single source of truth**;
  the README’s palette table was rewritten to match.

### Reworked `src/App.jsx`

- One `nav` state replaces `view + navStack`. The hash is observed via
  `hashchange`/`popstate`; navigation calls `setNav(...)` and the URL
  updates via `history.replaceState`.
- A single `now` is computed once a minute and threaded into
  `computeScores`, `LiveRequestsPanel`, and the top-bar relative time.
  No more "AttentionView and LiveRequestsPanel disagree about today".
- The 30-second `tock` is gone; the new 60s `now` actually changes
  output (age columns, "live x ago" badge).
- UI prefs (panel open, panel heights) are persisted via
  `usePersistedState`.
- Keyboard handlers: **Esc** pops the stack, **`/`** opens Live
  Requests and focuses the filter, **`g`** / **`l`** toggle the panels.
- The redundant breadcrumb row (Level 1 just said "Company") is gone —
  the bottom Excel tab bar carries the same information.

### New components

- **`StatStrip.jsx`** — the four/six-up stat row at the top of every
  view. Used by `CompanyView`, `DepartmentView`, `MemberView`. Cuts ~80
  lines of copy-paste per file.
- **`Sparkline.jsx`** — tiny inline SVG (area + line + last-point dot).
  No deps. Used in `CompanyView` per-dept rows and the org overview.
- **`Distribution.jsx`** — 5-column histogram of how many people sit in
  each burden bucket. Renders alongside the load-balance gauge inside
  `GraphingPanel`.

### Updated views

- **`CompanyView`** now has heat-mapped Pending and Resolve columns,
  a per-row 14-day Sparkline, a `BurdenBar` column (previously only in
  DepartmentView), and an extra "PEOPLE 1–2 (CAPACITY)" stat. Reads its
  data from `data.visibleDepartments` directly — the App-level
  re-aggregation is gone.
- **`DepartmentView`** got `aria-sort` on sortable headers, role/Enter/
  Space keyboard support on rows, heat-mapped Pending and Resolve, and
  uses `StatStrip`. Sort logic moved into a `useMemo` (was running on
  every render).
- **`MemberView`** uses `StatStrip` + `BurdenBar`, splits inbound /
  outbound counts into the stat row, line-throughs resolved
  descriptions (was just opacity), and uses arrow glyphs (`↗ Outbound`
  / `↘ Inbound`) instead of clashing pink/blue panels. Defaults
  `requests` to `[]` defensively.
- **`AttentionView`** dropped its hand-rolled `normaliseRequest` call
  (data is already normalised), reads `data.visibleDepartments`, and
  `ScoreBadge` is rendered in `compact` mode to keep rows scannable.

### Updated panels

- **`LiveRequestsPanel`** — new free-text search input
  (`description / member / dept`), filter chips persist across refresh,
  the loud red `217 SHOWN` pill became a calm slate counter, direction
  badges are neutral grey with arrow glyphs (`↗ out` / `↘ in`) so they
  stop competing with the burden palette, sortable Member column, sort
  state persisted, `aria-sort` on headers, accepts `now` and a
  `filterInputRef` from App.
- **`GraphingPanel`** — replaces the flat single-bar gauge with a
  side-by-side gauge + `Distribution` histogram (you can finally see
  *where* the gap lives), uses shared layout constants, the
  hard-to-parse "39 + 33" labels became "33/72" (resolved over total),
  bars get full-name tooltips so the truncation in dense charts is
  recoverable.

### Updated chrome

- **`TabBar`** — uses `TAB_BAR_H` from `layout.js`, blue active border
  thickened from 2px → 3px (was easy to miss against the dark top bar),
  `role="tablist"` / `role="tab"` / `aria-selected` for a11y.
- **`ScoreBadge`** — added `compact` mode for dense lists; `aria-label`
  spells out the score for screen readers.
- **`BurdenBar`** — accepts optional `height` / `segWidth`; gets an
  `aria-label`.
- **`index.css`** — now sets global `font-variant-numeric: tabular-nums`
  + a sensible focus-visible outline so a11y rings are uniform.

### Removed

- `src/App.css` — Vite scaffolding, never imported.
- `src/assets/hero.png`, `react.svg`, `vite.svg` — Vite scaffolding,
  never referenced. The whole `assets/` directory is gone.

### Tests

- **`scripts/test-scoring.mjs`** — 12 dependency-free assertions
  pinning the invariants that matter (score range, hidden dept
  excluded from aggregates, deterministic for fixed `now`, defensive
  on missing `requests`, etc.). Run with `npm test`. Currently green.

### Docs

- README rewritten in three places: colour palette now matches code,
  navigation section explains hash routing + keyboard shortcuts, file
  structure reflects the new utilities and components.

## Verification before shipping

- `npm run build` → 35 modules, ~378 KB JS / ~85 KB gzip, no errors.
- `npm run lint` → clean.
- `npm test` → all 12 assertions pass.
- Hash routing tested manually by editing `window.location.hash`.

## What is intentionally **not** done (good follow-ups)

These were on the review list but skipped — feel free to pick them up:

1. **Lazy-load `db.json`.** It’s still a static `import` in `App.jsx`,
   which inflates the initial bundle. The README already documents the
   `fetch('/db.json')` swap; do it when there’s a backend.
2. **Virtualise Live Requests.** 217 rows render fine today, but the
   panel is the obvious growth point. Plug `react-window` (would be
   the only runtime dep besides React).
3. **Hover preview on dept rows.** A floating card showing the top-3
   most burdened members + sparkline would save the most common click.
4. **CSV export from Live Requests.** Spreadsheet users will ask.
5. **Server-side scoring.** `scoring.js`’s docstring already explains
   the algorithm in enough detail to re-implement in Python or Go; the
   smoke tests in `scripts/test-scoring.mjs` are a good golden-output
   reference.
6. **The hidden `'cal'` department.** Still carved out by
   `HIDDEN_COMPANY_DEPT_IDS`. Either delete the carve-out or document
   what business reason keeps it; I left the behaviour exactly as it
   was, but it’s a smell.

## Conventions to keep

- **Layout constants live in `utils/layout.js`.** Don’t inline them.
- **Colour and typography tokens live in `utils/theme.js`.** If you find
  yourself typing `'#1a6fc4'` or `'#888'`, look in `COLORS` first.
- **All formatters live in `utils/format.js`.** Three views used to
  redefine `fmtSp`/`fmtR`/`formatTimestamp`. Don’t restart that.
- **Navigation is `nav.kind`.** If you’re tempted to add a parallel
  `view` flag, instead extend the union.
- **Anything written to `localStorage` goes through
  `usePersistedState`** so the `slap.` prefix stays consistent.
- **`computeScores` is a pure function of `(departments, { now })`.**
  Keep it that way — the smoke tests rely on it.
- **`normaliseRequest` is idempotent.** Don’t add side effects.

## Quick map of where logic lives

```
App.jsx                       hash routing, panel sizes, keyboard,
                              data → views fan-out
utils/scoring.js              burden algorithm, aggregations, palette,
                              heat colours, distribution, trend14
utils/nav.js                  hash <-> nav union <-> stack
utils/format.js               every formatter
utils/theme.js                every colour / typography token
utils/layout.js               every pixel constant + z-index
utils/persist.js              localStorage hook
components/CompanyView        Level 1 — heat + sparklines
components/DepartmentView     Level 2 — sortable, a11y
components/MemberView         Level 3 — outbound / inbound
components/AttentionView      Triage
components/StatStrip          Shared 4–6-up stat row
components/Sparkline          Inline SVG trend
components/Distribution       5-bucket histogram
components/ScoreBadge         Pill (full + compact)
components/BurdenBar          5-segment bar
components/TabBar             Bottom Excel-style tabs
components/LiveRequestsPanel  Filterable, sortable, persisted drawer
components/GraphingPanel      Workload chart + load-balance + dist
```

That’s the picture. If you change the algorithm, run `npm test`. If you
change layout constants, change them in `utils/layout.js`. If you add a
new view, extend the nav union — don’t add a parallel boolean.
