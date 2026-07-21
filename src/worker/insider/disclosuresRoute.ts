// POST /api/insider/disclosures — SEBI PIT Reg 7(2) insider disclosures.
//
// Body: { symbol, scripCode?, name? }. The BSE scrip code is resolved internally
// when absent. Two sources, fetched server-side, then merged + deduped:
//   NSE  (primary)      — corporate-insider-trading (best-effort; often IP-blocked)
//   BSE  (fallback)     — InsiderTrade15 (SEBI PIT 2015 / Reg 7(2))
//
// Safe-failure contract (HTTP 200):
//   - non-Indian company            -> not_found
//   - both feeds reachable, 0 rows  -> { ok:true, trades:[] }  (common & normal)
//   - both feeds failed to fetch    -> upstream_error / timeout
// Never log upstream bodies or cookies.

import type { Context } from "hono";
import type { InsiderResponse, InsiderSource, InsiderTrade } from "@shared/types";
import {
  mergeInsiderTrades,
  normalizeBseInsider,
  normalizeNseInsider,
} from "@shared/insiderTrading";
import type { Env } from "../env";
import { BSE_API_BASE, bodyString, bseFetch, clientSignalOf, safeJson } from "../bse/client";
import { NOT_AVAILABLE_MESSAGE, bseFailureMessage, resolveScrip } from "../bse/resolveRoute";
import { fetchNseInsider } from "../nse/client";

type Handler = (c: Context<{ Bindings: Env }>) => Promise<Response>;

const WINDOW_DAYS = 365;
const NOTE = "SEBI PIT Reg 7(2) disclosures";

export const insiderDisclosuresRoute: Handler = async (c) => {
  const json = (body: InsiderResponse) => c.json(body);
  const signal = clientSignalOf(c.req.raw);

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return json({ ok: false, code: "invalid_request", message: "Could not read the request." });
  }

  const body = payload as
    | { symbol?: unknown; scripCode?: unknown; name?: unknown; ticker?: unknown; query?: unknown }
    | null;
  const symbol = bodyString(body?.symbol) || bodyString(body?.ticker);
  let scripCode = bodyString(body?.scripCode).replace(/\D/g, "");
  let companyName = bodyString(body?.name);

  if (!symbol && !scripCode) {
    return json({
      ok: false,
      code: "invalid_request",
      message: "Provide a symbol, scrip code, or company name.",
    });
  }

  // ---- Resolve the BSE scrip code when not supplied ---------------------
  if (!scripCode) {
    const resolved = await resolveScrip(
      { name: bodyString(body?.name), ticker: symbol, query: bodyString(body?.query) },
      signal,
    );
    if (resolved.ok) {
      scripCode = resolved.scripCode;
      companyName = resolved.bseName;
    } else if (resolved.code === "not_found") {
      return json({ ok: false, code: "not_found", message: NOT_AVAILABLE_MESSAGE });
    }
    // Transient resolve error -> continue NSE-only (best-effort).
  }

  // ---- Fetch both feeds in parallel -------------------------------------
  const [nseRes, bseRes] = await Promise.all([
    symbol ? fetchNseInsider(symbol, signal) : Promise.resolve({ ok: false } as const),
    scripCode
      ? bseFetch(
          `${BSE_API_BASE}/InsiderTrade15/w?fromdt=&todt=&pageno=1&scripcode=${scripCode}`,
          signal,
        )
      : Promise.resolve({ ok: false as const, code: "upstream_error" as const }),
  ]);

  const nseTrades = nseRes.ok ? normalizeNseInsider(safeJson(nseRes.text)) : [];
  const bseTrades = bseRes.ok ? normalizeBseInsider(safeJson(bseRes.text)) : [];

  // Both feeds failed to fetch (not merely empty) -> a genuine error.
  const nseFetched = nseRes.ok;
  const bseFetched = bseRes.ok;
  if (!nseFetched && !bseFetched) {
    const code = !scripCode ? "not_found" : "upstream_error";
    return json(
      code === "not_found"
        ? { ok: false, code, message: NOT_AVAILABLE_MESSAGE }
        : { ok: false, code, message: bseFailureMessage("upstream_error") },
    );
  }

  // ---- Window filter + merge + dedupe + sort ----------------------------
  const now = Date.now();
  const toMs = now;
  const fromMs = now - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const trades: InsiderTrade[] = mergeInsiderTrades([...nseTrades, ...bseTrades], fromMs, toMs);

  const sources: InsiderSource[] = [];
  if (trades.some((t) => t.source === "NSE")) sources.push("NSE");
  if (trades.some((t) => t.source === "BSE")) sources.push("BSE");

  return json({
    ok: true,
    symbol,
    scripCode: scripCode || undefined,
    companyName: companyName || symbol || (scripCode ? `BSE ${scripCode}` : ""),
    asOf: new Date(now).toISOString(),
    windowFrom: new Date(fromMs).toISOString().slice(0, 10),
    windowTo: new Date(toMs).toISOString().slice(0, 10),
    trades,
    sources,
    note: NOTE,
  });
};
