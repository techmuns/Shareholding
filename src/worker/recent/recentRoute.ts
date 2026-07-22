// Recently viewed companies — a SHARED list backed by Workers KV, so every
// visitor sees the same set of companies opened in the last 7 days.
//
//   POST /api/recent/track  { ticker, name, country, sector }  -> record an open
//   GET  /api/recent/list                                      -> the 7-day list
//
// Each company is one KV entry keyed by ticker, written with a 7-day
// `expirationTtl` that is refreshed on every open — so a company drops off
// exactly 7 days after it was last opened. The company fields + timestamp live
// in the entry's metadata, so `list()` returns everything without a per-key get.
//
// Degrades gracefully: if the RECENT_KV binding is not configured, track no-ops
// and list returns an empty set (HTTP 200) — the rest of the app is unaffected.

import type { Context } from "hono";
import type { RecentCompany, RecentListResponse, RecentTrackResponse } from "@shared/types";
import type { Env } from "../env";
import { bodyString } from "../bse/client";

type Handler = (c: Context<{ Bindings: Env }>) => Promise<Response>;

const PREFIX = "co:";
const TTL_SECONDS = 7 * 24 * 60 * 60; // 604800 (7 days)
const MAX_LIST = 30;

/** What we stash in each KV entry's metadata (returned by list without a get). */
interface RecentMeta {
  ticker: string;
  name: string;
  country: string;
  sector: string;
  lastSeen: number; // epoch ms
}

/** Stable, KV-safe key for a company (tickers can contain spaces/punctuation). */
function keyFor(ticker: string): string {
  return PREFIX + encodeURIComponent(ticker.toUpperCase());
}

export const recentTrackRoute: Handler = async (c) => {
  const json = (body: RecentTrackResponse) => c.json(body);

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return json({ ok: false, code: "invalid_request", message: "Could not read the request." });
  }

  const b = payload as
    | { ticker?: unknown; name?: unknown; country?: unknown; sector?: unknown }
    | null;
  const ticker = bodyString(b?.ticker);
  if (!ticker) {
    return json({ ok: false, code: "invalid_request", message: "Provide a ticker." });
  }

  const kv = c.env.RECENT_KV;
  if (!kv) return json({ ok: true }); // not configured — no-op

  const meta: RecentMeta = {
    ticker,
    name: bodyString(b?.name),
    country: bodyString(b?.country),
    sector: bodyString(b?.sector),
    lastSeen: Date.now(),
  };

  try {
    await kv.put(keyFor(ticker), "", { expirationTtl: TTL_SECONDS, metadata: meta });
  } catch {
    // Never surface storage hiccups to the client — tracking is best-effort.
    return json({ ok: false, code: "provider_error", message: "Could not record the company." });
  }
  return json({ ok: true });
};

export const recentListRoute: Handler = async (c) => {
  const json = (body: RecentListResponse) => c.json(body);

  const kv = c.env.RECENT_KV;
  if (!kv) return json({ ok: true, companies: [] });

  try {
    const listed = await kv.list<RecentMeta>({ prefix: PREFIX, limit: 1000 });
    const companies: RecentCompany[] = listed.keys
      .map((k) => k.metadata)
      .filter((m): m is RecentMeta => !!m && typeof m.ticker === "string" && m.ticker !== "")
      .sort((a, b) => b.lastSeen - a.lastSeen) // most recent first
      .slice(0, MAX_LIST)
      .map((m) => ({
        ticker: m.ticker,
        name: m.name ?? "",
        country: m.country ?? "",
        sector: m.sector ?? "",
        lastSeen: new Date(m.lastSeen).toISOString(),
      }));
    return json({ ok: true, companies });
  } catch {
    return json({ ok: true, companies: [] });
  }
};
