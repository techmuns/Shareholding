# Shareholding

An **embedded (iframe) financial dashboard** that runs inside the Munshot host
platform. It lets a user pick a listed company and view its **shareholding** —
Promoter / FII / DII ownership breakdown (from BSE) and insider-trading
disclosures.

> This is the foundation session. It ships the full scaffold, a company-selector
> home screen, and the Shareholding dashboard shell with placeholder widgets.
> The shareholding data and insider-trading disclosures land in later sessions.

## What's here today

- **Company-selector home screen** — search by company name or ticker, pick one,
  and it becomes the selected company (held in a React context).
- **Shareholding dashboard shell** — the mandatory Munshot 3-zone layout with the
  selected company shown in the header ticker pill and four placeholder widget
  cards (Shareholding Summary, Promoter / FII / DII Trend, Individual Holders,
  Insider Trading Disclosures), each in an empty state.
- **Munshot SDK integration** — a single module-scoped client, a `useHostContext`
  hook, and a `dashboard.capture.snapshot` / `dashboard.capture.visual` handler.
- **Worker search proxy** — `POST /api/stock/search` forwards to the upstream
  Munshot stock API with a server-side secret so the token never reaches the
  browser. Every failure follows a safe-failure contract (HTTP 200 + `{ ok:false,
  code, message }`).

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

| Method | Path                 | Notes                                             |
| ------ | -------------------- | ------------------------------------------------- |
| GET    | `/api/health`        | `{ status: "ok", timestamp }`                     |
| POST   | `/api/stock/search`  | Body `{ query }`. Safe-failure contract (200 OK). |

Non-`/api` routes are served by the SPA (Static Assets fallback).
