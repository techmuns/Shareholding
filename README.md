# Shareholding

An **embedded (iframe) financial dashboard** that runs inside the Munshot host
platform. It lets a user pick a listed company and view its **shareholding** —
Promoter / FII / DII ownership breakdown (from BSE) and insider-trading
disclosures.

> Foundation + first two data cards. The company selector and 3-zone shell are in
> place, and the **Shareholding Summary** and **Promoter / FII / DII Trend** cards
> are wired to live BSE data. Individual holders and insider-trading disclosures
> land in later sessions.

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
  - **Insider Trading Disclosures** — sortable table of SEBI PIT Reg 7(2) filings
    (last 12 months) with buy/sell/pledge chips — wired to NSE (primary) + BSE.
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
  - `POST /api/insider/disclosures` — SEBI PIT Reg 7(2) insider-trading
    disclosures (last ~12 months), merged from NSE (primary) + BSE (fallback).

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

| Setting       | Value                       |
| ------------- | --------------------------- |
| Project type  | **Workers** (not Pages)     |
| Install       | `npm ci`                    |
| Build command | `npm run build`             |
| Deploy command| `npx wrangler deploy`       |
| Node version  | 20 or 22                    |

After the first deploy, set the secret once:

```bash
wrangler secret put MUNS_ACCESS_TOKEN
```

## API

| Method | Path                        | Notes                                                        |
| ------ | --------------------------- | ------------------------------------------------------------ |
| GET    | `/api/health`               | `{ status: "ok", timestamp }`                                |
| POST   | `/api/stock/search`         | Body `{ query }`. Safe-failure contract (200 OK).            |
| POST   | `/api/bse/resolve`          | Body `{ query?, ticker?, name? }` → `{ scripCode, bseName }`.|
| POST   | `/api/shareholding/pattern` | Body `{ scripCode }` or `{ query/ticker/name }` → pattern.   |
| POST   | `/api/shareholding/holders` | Body `{ scripCode }` or `{ query/ticker/name }` (+ `qtrId?`) → holders. |
| POST   | `/api/insider/disclosures`  | Body `{ symbol, scripCode?, name? }` → SEBI PIT Reg 7(2) trades. |

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
- `InsiderTrade15/w?fromdt=&todt=&pageno=1&scripcode=<code>` — SEBI PIT 2015
  (Reg 7(2)) insider-trading disclosures (empty date params return the recent
  set; the Worker filters to the last 12 months). `InsiderTrade92` is the legacy
  1992-regime table and is not used.

Insider disclosures also try NSE first —
`GET https://www.nseindia.com/api/corporate-insider-trading?index=equities&symbol=<SYM>`
— behind a manual cookie handshake (bootstrap `get-quotes` page → forward
`set-cookie`). NSE frequently blocks datacenter/Cloudflare egress IPs (Akamai),
so any NSE failure is a soft miss that falls through to BSE; the card's source
line reflects whichever feed actually returned rows.

Non-Indian (non-BSE) companies resolve to `not_found`, which the UI renders as a
clean "not available" empty state.

Non-`/api` routes are served by the SPA (Static Assets fallback).
