# SLAP — Workforce Load Intelligence Dashboard

Internal HR tooling for monitoring workforce burden across departments and individuals. Designed for senior decision-makers who need a fast, data-dense view of who is overloaded and who has capacity.

---

## What it does

SLAP ingests a flat JSON database of employee requests and computes a **burden score** (1–5) for every individual, department, and the company as a whole. It presents this in a three-level drill-down interface styled after a Bloomberg terminal or Excel — no decorative UI, no animations, dense information layout.

---

## Tech stack

- **Vite + React** (no router — navigation is pure state)
- **Plain inline styles** — no UI library, no Tailwind, no CSS modules
- **Single data source:** `src/data/db.json`

---

## Running locally

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`.

---

## Data schema

All data lives in `src/data/db.json`. The backend team should treat this file as the integration point — replacing it with a live API fetch requires zero changes to component logic.

```json
{
  "departments": [
    {
      "id": "eng",
      "name": "Engineering",
      "members": [
        {
          "id": "m_eng_1",
          "name": "Alice Chen",
          "role": "Backend Engineer",
          "department_id": "eng",
          "requests": [
            {
              "id": "r1",
              "description": "Migrate auth service to OAuth 2.0",
              "direction": "inbound",
              "complexity": 9,
              "timestamp": "2026-04-24T08:15:00Z",
              "status": "pending"
            }
          ]
        }
      ]
    }
  ]
}
```

**Field reference:**

| Field | Type | Description |
|---|---|---|
| `direction` | `"inbound"` \| `"outbound"` | Whether this person received or sent the request |
| `complexity` | `1–10` | How difficult the request is |
| `status` | `"pending"` \| `"resolved"` | Current state |
| `timestamp` | ISO 8601 string | When the request was created |

Only `pending` requests contribute to burden scores. Resolved requests are shown in the UI but greyed out and struck through.

---

## Burden score algorithm

Implemented in `src/utils/scoring.js`.

```
For each member:
  pending       = all requests where status === 'pending'
  volume        = pending.length
  difficulty    = avg complexity of pending requests

  Normalise volume and difficulty across ALL members company-wide to a 1–10 scale
  raw           = (normalised_volume × 0.4) + (normalised_difficulty × 0.6)

  Map raw to score 1–5:
    raw ≤ 2  →  1  (highly underburdened)
    raw ≤ 4  →  2  (somewhat underburdened)
    raw ≤ 6  →  3  (well burdened)
    raw ≤ 8  →  4  (somewhat overburdened)
    raw > 8  →  5  (highly overburdened)

Department score = mean of member scores (1 decimal place)
Company score    = mean of department scores (1 decimal place)
```

---

## Score colour system

Applied consistently across badges, burden bars, and summary numbers.
Source of truth: `SCORE_COLORS` / `SCORE_LABELS` in `src/utils/scoring.js`.

| Score | Label | Colour |
|---|---|---|
| 1 | Highly underutilised | `#1d4ed8` (blue) |
| 2 | Underutilised | `#7dd3fc` (sky) |
| 3 | Well burdened | `#16a34a` (green) |
| 4 | Overburdened | `#D85A30` (orange) |
| 5 | Highly overburdened | `#E24B4A` (red) |

The palette is a 5-step diverging scale around the green centre: cool = under, green = balanced, warm = over.

---

## Navigation model

Navigation is a discriminated union (`src/utils/nav.js`) serialised into the URL hash so deep links work and refresh preserves the view. Tabs at the bottom and the keyboard `Esc` key navigate the implied stack.

| Hash | View |
|---|---|
| `#/` | Company |
| `#/attention` | Attention triage |
| `#/dept/<id>` | Department |
| `#/dept/<id>/<memberId>` | Member |

Keyboard:
- `Esc` — pop one level
- `/` — open Live Requests + focus filter
- `g` — toggle Graphing panel
- `l` — toggle Live Requests panel

### Level 1 — Company overview

- Top bar with app name and current date
- Summary stats: headcount, company score, overburdened count, underburdened count, total pending requests
- Department table with columns: Department · Headcount · Avg Score · Overburdened · Underburdened · Pending Requests · Burden Bar
- Click any department name to drill into Level 2

### Level 2 — Department view

- Department summary stats row
- Member table with columns: Avatar · Name · Role · Outbound Pending · Inbound Pending · Avg Complexity · Burden Score · Bar
- All columns are sortable by clicking the header
- Click any member name to drill into Level 3

### Level 3 — Individual view

- Member header with name, role, department, burden score badge
- Stat strip: total requests, pending, resolved, avg complexity, outbound count, inbound count
- Two side-by-side scrollable tables: **Outbound** and **Inbound** requests
- Pending requests shown normally; resolved requests are greyed and struck through

### Tab bar (bottom, all levels)

Fixed at the bottom of every screen. Tabs accumulate as you drill down — identical to Excel sheet tabs.

```
[ Company ]  [ Engineering ]  [ Alice Chen ]
```

- Clicking any tab navigates back to that level instantly
- Active tab: white background, bold text, blue top border accent
- Inactive tabs: muted, clickable

### Breadcrumb (top, all levels)

A secondary breadcrumb trail sits below the top bar, showing the same drill-down path as the tabs. Also fully clickable.

---

## Live Requests Panel

Available at every level. Sits above the tab bar as a collapsible drawer.

- **Collapsed by default** — toggle with the arrow button
- Shows only `pending` requests, sorted by complexity descending
- Scoped to the current view:
  - Company level → all pending requests company-wide
  - Department level → all pending requests in that department
  - Member level → all pending requests for that individual
- Columns: Member · Department · Direction · Description · Complexity · Timestamp
- Direction badge is colour-coded: blue for outbound, pink for inbound

---

## File structure

```
/src
  /data
    db.json                  — single source of truth
  /components
    CompanyView.jsx          — Level 1 (heat columns + per-dept sparklines)
    DepartmentView.jsx       — Level 2 (sortable table, per-row burden bar)
    MemberView.jsx           — Level 3 (outbound/inbound request tables)
    AttentionView.jsx        — Triage view (over / stale / capacity)
    ScoreBadge.jsx           — colour-coded score pill
    BurdenBar.jsx            — 5-segment inline score bar
    StatStrip.jsx            — shared stat row used by all three levels
    Sparkline.jsx            — inline SVG sparkline (per-row trends)
    Distribution.jsx         — 5-bucket histogram for the load-balance panel
    TabBar.jsx               — Excel-style sheet tab navigation
    LiveRequestsPanel.jsx    — collapsible pending requests drawer
    GraphingPanel.jsx        — collapsible workload + load-balance drawer
  /utils
    scoring.js               — burden algorithm, palette, heat colours
    nav.js                   — discriminated nav union + hash routing
    layout.js                — layout constants (TAB_BAR_H, panel sizes)
    theme.js                 — colour / typography tokens
    format.js                — date / resolve-speed / initials helpers
    persist.js               — usePersistedState localStorage hook
  App.jsx                    — top bar, nav state, panel orchestration
  index.css                  — global reset, tabular-nums, focus rings
/scripts
  test-scoring.mjs           — dependency-free smoke tests (npm test)
index.html
```

---

## Backend integration notes

The frontend is intentionally decoupled from any data-fetching layer. To wire up a live backend:

1. Replace the static import in `App.jsx`:
   ```js
   // Before
   import rawData from './data/db.json';

   // After — example using useEffect
   const [rawData, setRawData] = useState(null);
   useEffect(() => {
     fetch('/api/data').then(r => r.json()).then(setRawData);
   }, []);
   ```

2. Ensure the API response matches the `db.json` schema exactly — same field names, same `direction`/`status` enum values.

3. No component logic needs to change.

The burden score algorithm runs entirely on the frontend on each load. If scores should be precomputed server-side, `src/utils/scoring.js` documents the exact formula to replicate.
