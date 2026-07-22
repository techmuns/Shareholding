// POST /api/shareholding/history — shareholding-pattern history.
//
// Body: { ticker (or symbol), country?, name? }. Sourced from the Munshot
// combined-financials feed (token-authenticated, same host/token as the search):
//   POST https://devde.muns.io/filings/combined_financials
//        { ticker, country, q, period }
// with `Authorization: Bearer <MUNS token>`. The upstream returns a Markdown
// company page; we parse ONLY its "Shareholding Pattern" section into a
// structured shape (category subtotals + named holders across recent quarters).
//
// Safe-failure contract (HTTP 200):
//   - missing token          -> not_configured
//   - missing ticker         -> invalid_request
//   - reachable, no pattern  -> not_found       (rendered as a clean empty state)
//   - upstream unreachable    -> timeout / upstream_error / provider_error
// Never log the token, the Authorization header, or the upstream body.

import type { Context } from "hono";
import type { ShareholdingHistoryResponse } from "@shared/types";
import {
  coerceMarkdown,
  hasShareholdingContent,
  parseShareholdingHistory,
} from "@shared/combinedFinancials";
import type { Env } from "../env";
import { bodyString, clientSignalOf } from "../bse/client";

type Handler = (c: Context<{ Bindings: Env }>) => Promise<Response>;

const UPSTREAM_URL = "https://devde.muns.io/filings/combined_financials";
const UPSTREAM_TIMEOUT_MS = 20_000;
const NOTE = "Shareholding pattern history · via Munshot";
const SOURCE = "Munshot";
const DEFAULT_COUNTRY = "India";
// The upstream requires these; shareholding is the same regardless, so we fix
// them and only surface the pattern section.
const BASIS = "consolidated";
const PERIOD = "annual";

export const shareholdingHistoryRoute: Handler = async (c) => {
  const json = (body: ShareholdingHistoryResponse) => c.json(body);
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
  const nameHint = bodyString(body?.name);

  if (!ticker) {
    return json({ ok: false, code: "invalid_request", message: "Provide a ticker symbol." });
  }

  const token = c.env.MUNS_ACCESS_TOKEN ?? c.env.MUNS_TOKEN;
  if (!token) {
    return json({
      ok: false,
      code: "not_configured",
      message: "Shareholding history isn't configured yet. Set the MUNS_ACCESS_TOKEN secret to enable it.",
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
      body: JSON.stringify({ ticker, country, q: BASIS, period: PERIOD }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      // A 404 upstream means "no data for this company", not an outage.
      if (upstream.status === 404) {
        return json({ ok: false, code: "not_found", message: "No shareholding data for this company." });
      }
      return json({
        ok: false,
        code: "upstream_error",
        message: "The shareholding provider is temporarily unavailable. Please try again.",
      });
    }

    let text: string;
    try {
      text = await upstream.text();
    } catch {
      return json({
        ok: false,
        code: "provider_error",
        message: "The shareholding provider returned an unreadable response.",
      });
    }

    const markdown = coerceMarkdown(text);
    const parsed = parseShareholdingHistory(markdown);

    if (!hasShareholdingContent(parsed)) {
      return json({ ok: false, code: "not_found", message: "No shareholding data for this company." });
    }

    return json({
      ok: true,
      symbol: ticker,
      companyName: parsed.companyName || nameHint || ticker,
      asOf: new Date().toISOString(),
      quarters: parsed.quarters,
      groups: parsed.groups,
      shareholders: parsed.shareholders,
      source: SOURCE,
      note: NOTE,
    });
  } catch {
    return json({
      ok: false,
      code: timedOut ? "timeout" : "provider_error",
      message: timedOut
        ? "Shareholding history took too long to respond. Please try again."
        : "Could not reach the shareholding provider. Please try again.",
    });
  } finally {
    clearTimeout(timer);
  }
};
