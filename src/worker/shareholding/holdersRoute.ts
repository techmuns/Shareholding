// POST /api/shareholding/holders — named individual holders for a company.
//
// Body: { scripCode } OR { query / ticker / name } (resolved internally).
// Optional { qtrId } selects a quarter; defaults to the latest from SHPQNewFormat.
//
// Sources (both server-side via the shared BSE client):
//   Corp_shpPromoterNGroup_ng  -> named promoter & promoter-group entities
//   Corp_shpSec_SHPPubShold_ng -> named public/institutional holders (FII/DII/other)
//
// Safe-failure contract: every path returns HTTP 200. `not_found` = not covered
// by BSE (e.g. non-Indian listings). Never log upstream bodies.

import type { Context } from "hono";
import type { HoldersResponse } from "@shared/types";
import {
  HOLDERS_DISCLOSURE_NOTE,
  extractPromoterHolders,
  extractPublicHolders,
  extractQuarters,
} from "@shared/bseShareholding";
import type { Env } from "../env";
import { BSE_API_BASE, bodyString, bseFetch, clientSignalOf, safeJson } from "../bse/client";
import { NOT_AVAILABLE_MESSAGE, bseFailureMessage, resolveScrip } from "../bse/resolveRoute";

type Handler = (c: Context<{ Bindings: Env }>) => Promise<Response>;

export const shareholdingHoldersRoute: Handler = async (c) => {
  const json = (body: HoldersResponse) => c.json(body);
  const signal = clientSignalOf(c.req.raw);

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return json({ ok: false, code: "invalid_request", message: "Could not read the request." });
  }

  const body = payload as
    | { scripCode?: unknown; query?: unknown; ticker?: unknown; name?: unknown; qtrId?: unknown }
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

  // ---- Pick the quarter (requested qtrId or latest) ---------------------
  const qlist = await bseFetch(`${BSE_API_BASE}/SHPQNewFormat/w?scripcode=${scripCode}`, signal);
  if (!qlist.ok) {
    return json({ ok: false, code: qlist.code, message: bseFailureMessage(qlist.code) });
  }
  const quarters = extractQuarters(safeJson(qlist.text)); // newest first
  if (quarters.length === 0) {
    return json({ ok: false, code: "not_found", message: NOT_AVAILABLE_MESSAGE });
  }

  const requestedQtr = bodyString(body?.qtrId);
  const quarter = quarters.find((q) => q.qtrId === requestedQtr) ?? quarters[0];

  // ---- Fetch promoter + public holder tables (parallel) -----------------
  const [promRes, pubRes] = await Promise.all([
    bseFetch(
      `${BSE_API_BASE}/Corp_shpPromoterNGroup_ng/w?SCRIPCODE=${scripCode}&QtrCode=${quarter.qtrId}`,
      signal,
    ),
    bseFetch(
      `${BSE_API_BASE}/Corp_shpSec_SHPPubShold_ng/w?SCRIPCODE=${scripCode}&QtrCode=${quarter.qtrId}`,
      signal,
    ),
  ]);

  // Both upstreams failing is a genuine error; one failing degrades gracefully.
  if (!promRes.ok && !pubRes.ok) {
    const code = promRes.code === "timeout" || pubRes.code === "timeout" ? "timeout" : "upstream_error";
    return json({ ok: false, code, message: bseFailureMessage(code) });
  }

  const promoters = promRes.ok ? extractPromoterHolders(safeJson(promRes.text)) : [];
  const publicHolders = pubRes.ok
    ? extractPublicHolders(safeJson(pubRes.text))
    : { fii: [], dii: [], publicOther: [] };

  return json({
    ok: true,
    scripCode,
    companyName: companyName || `BSE ${scripCode}`,
    qtrLabel: quarter.qtrLabel,
    asOf: new Date().toISOString(),
    promoters,
    fii: publicHolders.fii,
    dii: publicHolders.dii,
    publicOther: publicHolders.publicOther,
    disclosureNote: HOLDERS_DISCLOSURE_NOTE,
  });
};
