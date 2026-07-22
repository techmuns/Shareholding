# Shareholding

An **embedded (iframe) financial dashboard** that runs inside the Munshot host
platform. It lets a user pick a listed company and view its **shareholding** —
Promoter / FII / DII ownership breakdown (from BSE) and insider-trading
disclosures.

> The company selector and 3-zone shell are in place, and every card is wired to
> live data: **Shareholding Summary**, **Promoter / FII / DII Trend** and
> **Individual Holders** from BSE; **Insider Trading Disclosures** and
> **Shareholding Pattern (History)** from the Munshot filings APIs.

## What's here today

- **Company-selector home screen** — search by company name or ticker, pick one,
  and it becomes the selected company (held in a React context).
- **Shareholding dashboard** — the mandatory Munshot 3-zone layout with the
  selected company in the header ticker pill and four widget cards:
  - **Shareholding Summary** — KPI row (Promoter / FII·FPI / DII / Public) for the
    latest quarter with QoQ deltas — wired to BSE.
  - **Promoter / FII / DII Trend** — an inline-SVG stacked bar chart across the
    recent quarters — wired to BSE.
  - **Individual Holders** — tabbed, sortable tables of named Promoter / FII·FPI /
    DII / Other-Public holders (with promoter pledge %) — wired to BSE.
  - **Shareholding Pattern (History)** — the multi-quarter shareholding pattern
    from the Munshot combined-financials feed: category subtotals (Promoters /
    FIIs / DIIs / Government / Public) with the named entities disclosed under
    each, in a collapsible, period-wide table.
  - **Insider Trading Disclosures** — sortable table of SEBI PIT insider dealings
    with buy/sell/pledge chips — wired to the Munshot filings API (Trendlyne).
- **Embeddability & polish** (works standalone or embedded in Munshot):
  - **Host-context auto-select** — when the host supplies a selected ticker via the
    SDK, the dashboard auto-selects that company and loads all four cards
    (skipping the picker), and reacts to host ticker changes without a refresh.
    The manual picker is the fallback; a user "Change" override sticks until the
    host pushes a new ticker. Each selection publishes `shareholding.company.select`.
  - **Header actions** — **Refresh** (re-fetches all cards; keeps prior data
    visible with a spinner rather than blanking) and **Export** (downloads the
    current company's data as a single, sectioned CSV — Summary, Trend, Holders,
    Insider — stamped with company/quarter/as-of).
  - **Live snapshot handler** — `dashboard.capture.snapshot` returns the current
    `{ context, selection, data }` (loaded sections only); `dashboard.capture.visual`
    captures Zone 2 as a Blob.
  - **Partial-data resilience** — the cards fetch independently; one failing
    shows only its own error state and never blanks the others. Each card also
    carries its own source/freshness line.
- **Munshot SDK integration** — a single module-scoped client, a `useHostContext`
  hook, and a `dashboard.capture.snapshot` / `dashboard.capture.visual` handler.
- **Worker proxies (safe-failure contract, HTTP 200 + `{ ok:false, code, message }`)**:
  - `POST /api/stock/search` — company search via the upstream Munshot API
    (server-side bearer token, never exposed to the browser).
  - `POST /api/bse/resolve` — resolve a company name/ticker to a BSE scrip code.
  - `POST /api/shareholding/pattern` — normalized BSE shareholding pattern
    (latest quarter + trend). Fetched server-side with the browser-like headers
    BSE requires; non-Indian companies return a clean `not_found`.
  - `POST /api/shareholding/holders` — named individual holders (promoters,
    FII/FPI, DII, other public) for the latest quarter, with promoter pledge %.
  - `POST /api/insider/disclosures` — SEBI PIT insider-trading disclosures from
    the token-authenticated Munshot filings API (`filings/data/insider_trades`).
  - `POST /api/shareholding/history` — the multi-quarter shareholding pattern
    (category subtotals + named holders) parsed from the Munshot combined-
    financials feed (`filings/combined_financials`). The upstream returns a
    Markdown company page; the Worker uses only its "Shareholding Pattern"
    section and ignores the rest.

## Tech stack

| Layer      | Choice                                                            |
| ---------- | ---------------------------------------------------------------- |
| Runtime    | Cloudflare **Workers** (not Pages)                               |
| API        | [Hono](https://hono.dev) for `/api/*`                            |
| UI         | React 19 + Vite 7 + TypeScript 5                                 |
| Dev server | `@cloudflare/vite-plugin` (Workers runtime + HMR, one server)    |
| Styling    | Tailwind CSS v4 via `@tailwindcss/vite` (`@theme`, no config file)|
| Routing    | `react-router-dom` v7                                            |
| Icons      | `lucide-react`                                                   |
| Classes    | `clsx` + `tailwind-merge`                                        |
| Static SPA | Workers Static Assets binding (`single-page-application`)        |

## Project layout

```
src/
├── react-app/
│   ├── components/{layout,ui}   # DashboardShell, Header, WidgetCard, states…
│   ├── pages/                   # CompanySelectPage, ShareholdingPage
│   ├── hooks/                   # useHostContext
│   ├── lib/                     # sdk.ts, api.ts, cn.ts
│   ├── state/                   # selected-company context
│   ├── App.tsx, main.tsx, index.css
├── shared/                      # imported by BOTH app and worker
│   ├── types.ts
│   └── stockSearch.ts           # pure normalizer helpers
└── worker/
    ├── index.ts                 # Hono app (+ SPA fallback)
    └── stock/searchRoute.ts     # upstream search proxy
```

## Scripts

| Script              | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `npm run dev`       | Start the unified Vite + Workers dev server         |
| `npm run build`     | `tsc -b && vite build` (type-check then build)      |
| `npm run preview`   | Preview the production client build                 |
| `npm run deploy`    | `npm run build && wrangler deploy`                  |
| `npm run cf-typegen`| Generate Worker binding types (`wrangler types`)    |
| `npm run typecheck` | Type-check all projects (`tsc -b`)                  |
| `npm run lint`      | Lint with ESLint                                    |
| `npm run check`     | Pre-push gate: lint → typecheck → build → `wrangler deploy --dry-run` |

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # then paste your token
npm run dev
```

`.dev.vars` (git-ignored) provides `MUNS_ACCESS_TOKEN` for the local Worker.
Without a token, company search returns the `not_configured` inline hint — the
app still runs, it just can't search yet.

## Secrets

The upstream stock API requires a bearer token. It is a **Worker secret** and is
**never committed** and **never sent to the browser**:

```bash
wrangler secret put MUNS_ACCESS_TOKEN
```

The Worker injects it as `Authorization: Bearer <token>` and adds the fixed
`user_index` constant server-side; the client only ever sends `{ query }`.

## Cloudflare Workers deployment settings

Deploy via **Cloudflare Workers Builds** (Workers & Pages → the Worker → Settings →
Builds), or from a machine with `npx wrangler deploy`. The `@cloudflare/vite-plugin`
emits the deploy-ready Worker config to `dist/shareholding/wrangler.json` during
`build`; `wrangler deploy` picks it up automatically.

| Setting            | Value                              |
| ------------------ | ---------------------------------- |
| Project type       | **Workers** (not Pages)            |
| Install command    | `npm ci`                           |
| Build command      | `npm run build`                    |
| Deploy command     | `npx wrangler deploy`              |
| Build output dir   | _(leave blank)_ — Wrangler resolves assets from `wrangler.jsonc` (`./dist/client`) |
| Node version       | 20 or 22                           |

`wrangler.jsonc` is already configured: `name: "shareholding"`, `main:
"./src/worker/index.ts"`, a current `compatibility_date`, `compatibility_flags:
["nodejs_compat"]`, and the `assets` block (`./dist/client`, `binding: "ASSETS"`,
`not_found_handling: "single-page-application"`). Verify locally with
`npm run check` (runs the dry-run).

After the first deploy, set the secret once (enables the company picker):

```bash
wrangler secret put MUNS_ACCESS_TOKEN
```

No secret values live in the repo. `.dev.vars` is git-ignored; only
`.dev.vars.example` (empty placeholder) is committed.

## API

| Method | Path                        | Notes                                                        |
| ------ | --------------------------- | ------------------------------------------------------------ |
| GET    | `/api/health`               | `{ status: "ok", timestamp }`                                |
| POST   | `/api/stock/search`         | Body `{ query }`. Safe-failure contract (200 OK).            |
| POST   | `/api/bse/resolve`          | Body `{ query?, ticker?, name? }` → `{ scripCode, bseName }`.|
| POST   | `/api/shareholding/pattern` | Body `{ scripCode }` or `{ query/ticker/name }` → pattern.   |
| POST   | `/api/shareholding/holders` | Body `{ scripCode }` or `{ query/ticker/name }` (+ `qtrId?`) → holders. |
| POST   | `/api/insider/disclosures`  | Body `{ ticker, country?, name? }` → SEBI PIT insider trades (Munshot). |
| POST   | `/api/shareholding/history` | Body `{ ticker, country?, name? }` → multi-quarter shareholding pattern (Munshot). |

All POST routes use the safe-failure contract (always HTTP 200; success is
`{ ok:true, ... }`, failures are `{ ok:false, code, message }`).

### BSE endpoints used (server-side)

The shareholding routes call BSE's public JSON APIs under
`https://api.bseindia.com/BseIndiaAPI/api`, which require browser-like headers
(`Referer`/`Origin`/`User-Agent`/`Accept`) on every request:

- `PeerSmartSearch/w?Type=SS&text=<q>` — name/ticker → scrip code (resolver).
- `SHPQNewFormat/w?scripcode=<code>` — list of shareholding-pattern quarters.
- `Corp_shpSec_SHPSUMMARY_ng/w?SCRIPCODE=&QtrCode=` — Promoter / Public / Other totals.
- `Corp_shpSec_SHPPubShold_ng/w?SCRIPCODE=&QtrCode=` — public split (FII/FPI, DII,
  government, non-institutions) from the "Sub Total" rows; its NAMED rows are the
  individual public/institutional holders (classified by the section they sit in).
- `Corp_shpPromoterNGroup_ng/w?SCRIPCODE=&QtrCode=` — named promoter & promoter-
  group entities with shares, % holding and pledge/encumbrance %.

**Insider disclosures** come from the token-authenticated **Munshot filings API**
(same host and bearer token as the company search):
`POST https://devde.muns.io/filings/data/insider_trades` with body
`{ ticker, country }` and `Authorization: Bearer <MUNS token>`. It returns SEBI
PIT insider dealings (Company / Insider / Category / Transaction / Trade Shares /
Trade Value / Post-Holding % / Mode / Broadcast Date / Source, e.g. Trendlyne).
The token is read from `MUNS_ACCESS_TOKEN` (or `MUNS_TOKEN`); with no token the
insider card shows a `not_configured` state while the BSE cards still load.

**Shareholding pattern history** comes from the same Munshot filings host:
`POST https://devde.muns.io/filings/combined_financials` with body
`{ ticker, country, q, period }` and `Authorization: Bearer <MUNS token>`. That
endpoint returns a full Markdown company page, but this is a shareholding
dashboard, so the Worker parses and returns **only** its "Shareholding Pattern"
section — the category subtotals (Promoters / FIIs / DIIs / Government / Public)
and the named entities under each, across the recent quarters. Same token rules
as above.

Non-Indian (non-BSE) companies resolve to `not_found`, which the UI renders as a
clean "not available" empty state.

Non-`/api` routes are served by the SPA (Static Assets fallback).

## Data sources & known limitations

- **BSE shareholding pattern and individual holders** are fetched **server-side in
  the Worker** with browser-like headers, because BSE returns 403 to plain server
  requests. This avoids CORS and keeps the flow reliable. All normalizers are pure
  and never throw — malformed upstream rows degrade to safe defaults (no `NaN%`),
  so odd/interim quarters and missing category rows render cleanly.
- **Insider disclosures come from the Munshot filings API** (Trendlyne-backed),
  token-authenticated so it isn't IP-blocked like the exchanges. The normalizer
  matches fields defensively (works whether the API returns display labels,
  snake_case, or a columns+rows table) and never throws.
- **The shareholding pattern history comes from the Munshot combined-financials
  API**, which returns a Markdown company page. Only its "Shareholding Pattern"
  section is used; the fundamentals / P&L / balance-sheet / peer sections are
  intentionally ignored. The parser is pure and never throws — it tolerates the
  body arriving as raw Markdown, a bare JSON string, or JSON wrapping the
  Markdown, and a missing section degrades to a clean "not available" state.
- **Coverage is BSE-listed Indian companies** for the pattern/holders cards;
  non-Indian tickers surface the clean "not available" state, not an error.
- **Disclosure thresholds are BSE's:** individual public/institutional holders
  are disclosed only above 1% of total shares; promoter-group entities are listed
  in full. Insider disclosures cover a rolling ~12-month window.
