// POST /api/insider/disclosures — insider-trading (SEBI PIT) disclosures.
//
// Body: { ticker (or symbol), country?, name? }. Sourced from the Munshot filings
// API, which is token-authenticated (so it isn't IP-blocked like the exchanges):
//   POST https://devde.muns.io/filings/data/insider_trades  { ticker, country }
// with `Authorization: Bearer <MUNS token>`.
//
// Safe-failure contract (HTTP 200):
//   - missing token         -> not_configured
//   - missing ticker        -> invalid_request
//   - reachable, 0 rows     -> { ok:true, trades:[] }   (normal)
//   - upstream unreachable  -> timeout / upstream_error / provider_error
// Never log the token, the Authorization header, or the upstream body.

import type { Context } from "hono";
import type { InsiderResponse, InsiderSource, InsiderTrade } from "@shared/types";
import { mergeInsiderTrades, normalizeMunshotInsider, parseInsiderDateMs } from "@shared/insiderTrading";
import type { Env } from "../env";
import { bodyString, clientSignalOf } from "../bse/client";

type Handler = (c: Context<{ Bindings: Env }>) => Promise<Response>;

const UPSTREAM_URL = "https://devde.muns.io/filings/data/insider_trades";
const UPSTREAM_TIMEOUT_MS = 15_000;
const MAX_TRADES = 250;
const NOTE = "SEBI PIT insider dealings · via Munshot (Trendlyne)";
const DEFAULT_COUNTRY = "India";

const todayIso = () => new Date().toISOString().slice(0, 10);

export const insiderDisclosuresRoute: Handler = async (c) => {
  const json = (body: InsiderResponse) => c.json(body);
  const clientSignal = clientSignalOf(c.req.raw);

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return json({ ok: false, code: "invalid_request", message: "Could not read the request." });
  }

  const body = payload as
    | { ticker?: unknown; symbol?: unknown; country?: unknown; name?: unknown }
    | null;
  const ticker = bodyString(body?.ticker) || bodyString(body?.symbol);
  const country = bodyString(body?.country) || DEFAULT_COUNTRY;
  const companyName = bodyString(body?.name) || ticker;

  if (!ticker) {
    return json({ ok: false, code: "invalid_request", message: "Provide a ticker symbol." });
  }

  const token = c.env.MUNS_ACCESS_TOKEN ?? c.env.MUNS_TOKEN;
  if (!token) {
    return json({
      ok: false,
      code: "not_configured",
      message: "Insider data isn't configured yet. Set the MUNS_ACCESS_TOKEN secret to enable it.",
    });
  }

  // ---- Fetch upstream (15s timeout, forwarding the client's abort) ------
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, UPSTREAM_TIMEOUT_MS);
  if (clientSignal) {
    if (clientSignal.aborted) controller.abort();
    else clientSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const upstream = await fetch(UPSTREAM_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ticker, country }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      return json({
        ok: false,
        code: "upstream_error",
        message: "The insider data provider is temporarily unavailable. Please try again.",
      });
    }

    let raw: unknown;
    try {
      raw = await upstream.json();
    } catch {
      return json({
        ok: false,
        code: "provider_error",
        message: "The insider data provider returned an unreadable response.",
      });
    }

    // Normalize, dedupe, sort newest-first (wide window = no date filtering), cap.
    const all = normalizeMunshotInsider(raw);
    const sorted = mergeInsiderTrades(all, 0, Number.MAX_SAFE_INTEGER);
    const trades: InsiderTrade[] = sorted.slice(0, MAX_TRADES);

    // Freshness window = the actual span of the disclosures shown.
    let windowFrom = todayIso();
    let windowTo = todayIso();
    const stamps = trades
      .map((t) => parseInsiderDateMs(t.disclosureDate))
      .filter((ms): ms is number => ms != null);
    if (stamps.length > 0) {
      windowFrom = new Date(Math.min(...stamps)).toISOString().slice(0, 10);
      windowTo = new Date(Math.max(...stamps)).toISOString().slice(0, 10);
    }

    const sources: InsiderSource[] = [...new Set(trades.map((t) => t.source).filter(Boolean))];

    return json({
      ok: true,
      symbol: ticker,
      companyName,
      asOf: new Date().toISOString(),
      windowFrom,
      windowTo,
      trades,
      sources,
      note: NOTE,
    });
  } catch {
    return json({
      ok: false,
      code: timedOut ? "timeout" : "provider_error",
      message: timedOut
        ? "Insider data took too long to respond. Please try again."
        : "Could not reach the insider data provider. Please try again.",
    });
  } finally {
    clearTimeout(timer);
  }
};
