// POST /api/financials/combined — company fundamentals & financial statements.
//
// Body: { ticker (or symbol), country?, q?, period?, name? }. Sourced from the
// Munshot filings API (token-authenticated, same host/token as the search):
//   POST https://devde.muns.io/filings/combined_financials
//        { ticker, country, q, period }
// with `Authorization: Bearer <MUNS token>`. The upstream returns a Markdown
// document which we parse into a structured shape (pure, never throws).
//
// Safe-failure contract (HTTP 200):
//   - missing token          -> not_configured
//   - missing ticker         -> invalid_request
//   - reachable, no content  -> not_found      (rendered as a clean empty state)
//   - upstream unreachable    -> timeout / upstream_error / provider_error
// Never log the token, the Authorization header, or the upstream body.

import type { Context } from "hono";
import type { CombinedFinancialsResponse } from "@shared/types";
import {
  coerceMarkdown,
  hasFinancialsContent,
  parseCombinedFinancials,
} from "@shared/combinedFinancials";
import type { Env } from "../env";
import { bodyString, clientSignalOf } from "../bse/client";

type Handler = (c: Context<{ Bindings: Env }>) => Promise<Response>;

const UPSTREAM_URL = "https://devde.muns.io/filings/combined_financials";
const UPSTREAM_TIMEOUT_MS = 20_000;
const NOTE = "Fundamentals & financial statements · via Munshot";
const SOURCE = "Munshot";
const DEFAULT_COUNTRY = "India";
const DEFAULT_BASIS = "consolidated";
const DEFAULT_PERIOD = "annual";

export const combinedFinancialsRoute: Handler = async (c) => {
  const json = (body: CombinedFinancialsResponse) => c.json(body);
  const clientSignal = clientSignalOf(c.req.raw);

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return json({ ok: false, code: "invalid_request", message: "Could not read the request." });
  }

  const body = payload as
    | { ticker?: unknown; symbol?: unknown; country?: unknown; q?: unknown; period?: unknown; name?: unknown }
    | null;
  const ticker = bodyString(body?.ticker) || bodyString(body?.symbol);
  const country = bodyString(body?.country) || DEFAULT_COUNTRY;
  const basis = bodyString(body?.q) || DEFAULT_BASIS;
  const period = bodyString(body?.period) || DEFAULT_PERIOD;
  const nameHint = bodyString(body?.name);

  if (!ticker) {
    return json({ ok: false, code: "invalid_request", message: "Provide a ticker symbol." });
  }

  const token = c.env.MUNS_ACCESS_TOKEN ?? c.env.MUNS_TOKEN;
  if (!token) {
    return json({
      ok: false,
      code: "not_configured",
      message: "Financials aren't configured yet. Set the MUNS_ACCESS_TOKEN secret to enable them.",
    });
  }

  // ---- Fetch upstream (timeout + forwarding the client's abort) ----------
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
      body: JSON.stringify({ ticker, country, q: basis, period }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      // A 404 upstream means "no fundamentals for this company", not an outage.
      if (upstream.status === 404) {
        return json({ ok: false, code: "not_found", message: "No financial data for this company." });
      }
      return json({
        ok: false,
        code: "upstream_error",
        message: "The financials provider is temporarily unavailable. Please try again.",
      });
    }

    let text: string;
    try {
      text = await upstream.text();
    } catch {
      return json({
        ok: false,
        code: "provider_error",
        message: "The financials provider returned an unreadable response.",
      });
    }

    const markdown = coerceMarkdown(text);
    const parsed = parseCombinedFinancials(markdown);

    if (!hasFinancialsContent(parsed)) {
      return json({ ok: false, code: "not_found", message: "No financial data for this company." });
    }

    return json({
      ok: true,
      symbol: ticker,
      companyName: parsed.companyName || nameHint || ticker,
      asOf: new Date().toISOString(),
      basis,
      period,
      about: parsed.about,
      pros: parsed.pros,
      cons: parsed.cons,
      metrics: parsed.metrics,
      profitAndLoss: parsed.profitAndLoss,
      balanceSheet: parsed.balanceSheet,
      quarterly: parsed.quarterly,
      peers: parsed.peers,
      source: SOURCE,
      note: NOTE,
    });
  } catch {
    return json({
      ok: false,
      code: timedOut ? "timeout" : "provider_error",
      message: timedOut
        ? "Financials took too long to respond. Please try again."
        : "Could not reach the financials provider. Please try again.",
    });
  } finally {
    clearTimeout(timer);
  }
};
