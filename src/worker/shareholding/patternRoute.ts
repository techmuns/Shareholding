// POST /api/shareholding/pattern — BSE shareholding pattern for a company.
//
// Body: { scripCode } OR { query / ticker / name } (resolved internally).
// Fetches the quarter list, then the category summary + public breakdown for the
// latest few quarters (in parallel), and normalizes into `ShareholdingPattern`.
//
// Safe-failure contract: every path returns HTTP 200. `not_found` = the company
// isn't covered by BSE (e.g. non-Indian listings) — the client renders an empty
// state, not an error. Never log upstream bodies.

import type { Context } from "hono";
import type { ShareholdingPatternResponse, ShareholdingQuarter } from "@shared/types";
import {
  buildBreakdown,
  extractPublicSplit,
  extractQuarters,
  extractSummaryTotals,
  isMeaningfulBreakdown,
  breakdownSumsToWhole,
} from "@shared/bseShareholding";
import type { Env } from "../env";
import { BSE_API_BASE, bodyString, bseFetch, clientSignalOf, safeJson } from "../bse/client";
import {
  NOT_AVAILABLE_MESSAGE,
  bseFailureMessage,
  resolveScrip,
} from "../bse/resolveRoute";

type Handler = (c: Context<{ Bindings: Env }>) => Promise<Response>;

/** How many recent quarters to include in the trend (keeps the chart readable). */
const MAX_QUARTERS = 6;

export const shareholdingPatternRoute: Handler = async (c) => {
  const json = (body: ShareholdingPatternResponse) => c.json(body);
  const signal = clientSignalOf(c.req.raw);

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return json({
      ok: false,
      code: "invalid_request",
      message: "Could not read the request.",
    });
  }

  const body = payload as
    | { scripCode?: unknown; query?: unknown; ticker?: unknown; name?: unknown }
    | null;

  // ---- Resolve the scrip code -------------------------------------------
  let scripCode = bodyString(body?.scripCode).replace(/\D/g, "");
  let companyName = bodyString(body?.name);

  if (!scripCode) {
    const input = {
      name: bodyString(body?.name),
      ticker: bodyString(body?.ticker),
      query: bodyString(body?.query),
    };
    if ((input.name || input.query || input.ticker).length < 2) {
      return json({
        ok: false,
        code: "invalid_request",
        message: "Provide a scrip code, company name, or ticker.",
      });
    }
    const resolved = await resolveScrip(input, signal);
    if (!resolved.ok) {
      return resolved.code === "not_found"
        ? json({ ok: false, code: "not_found", message: NOT_AVAILABLE_MESSAGE })
        : json({ ok: false, code: resolved.code, message: bseFailureMessage(resolved.code) });
    }
    scripCode = resolved.scripCode;
    companyName = resolved.bseName;
  }

  // ---- Quarter list ------------------------------------------------------
  const qlist = await bseFetch(`${BSE_API_BASE}/SHPQNewFormat/w?scripcode=${scripCode}`, signal);
  if (!qlist.ok) {
    return json({ ok: false, code: qlist.code, message: bseFailureMessage(qlist.code) });
  }
  const quarters = extractQuarters(safeJson(qlist.text)); // newest first
  if (quarters.length === 0) {
    return json({ ok: false, code: "not_found", message: NOT_AVAILABLE_MESSAGE });
  }

  const selected = quarters.slice(0, MAX_QUARTERS); // newest first

  // ---- Summary + public breakdown per quarter (parallel) ----------------
  const perQuarter = await Promise.all(
    selected.map(async (q) => {
      const [sumRes, pubRes] = await Promise.all([
        bseFetch(
          `${BSE_API_BASE}/Corp_shpSec_SHPSUMMARY_ng/w?SCRIPCODE=${scripCode}&QtrCode=${q.qtrId}`,
          signal,
        ),
        bseFetch(
          `${BSE_API_BASE}/Corp_shpSec_SHPPubShold_ng/w?SCRIPCODE=${scripCode}&QtrCode=${q.qtrId}`,
          signal,
        ),
      ]);

      const summary = sumRes.ok ? extractSummaryTotals(safeJson(sumRes.text)) : null;
      const split = pubRes.ok
        ? extractPublicSplit(safeJson(pubRes.text))
        : { fiiPct: 0, diiPct: 0, govtPct: 0, nonInstPct: 0, found: false };

      const quarter: ShareholdingQuarter = {
        qtrId: q.qtrId,
        qtrLabel: q.qtrLabel,
        breakdown: buildBreakdown(summary, split),
      };
      return { quarter, clean: sumRes.ok && pubRes.ok && !!summary && split.found };
    }),
  );

  // Keep only quarters that produced meaningful numbers (newest-first order).
  const usable = perQuarter.filter((x) => isMeaningfulBreakdown(x.quarter.breakdown));
  if (usable.length === 0) {
    // Nothing normalized — distinguish a total upstream failure from "no data".
    const anyOk = perQuarter.length > 0;
    return anyOk
      ? json({ ok: false, code: "not_found", message: NOT_AVAILABLE_MESSAGE })
      : json({ ok: false, code: "upstream_error", message: bseFailureMessage("upstream_error") });
  }

  const latest = usable[0].quarter; // newest
  const trend = usable.map((x) => x.quarter).reverse(); // oldest -> newest

  const partial =
    usable.length < selected.length ||
    perQuarter.some((x) => !x.clean) ||
    !breakdownSumsToWhole(latest.breakdown);

  return json({
    ok: true,
    scripCode,
    companyName: companyName || `BSE ${scripCode}`,
    latest,
    trend,
    asOf: new Date().toISOString(),
    partial,
  });
};
