// POST /api/bse/resolve — resolve a company (name/ticker) to a BSE scrip code.
//
// Uses BSE PeerSmartSearch, which returns suggestion markup embedding each
// company's name + numeric scrip code. We prefer matching on the company NAME
// (more reliable on BSE than the NSE symbol), falling back to the ticker.
//
// Safe-failure contract: every path returns HTTP 200. `not_found` is a clean
// "not covered by BSE" signal, not an error.

import type { Context } from "hono";
import type { BseResolveResponse } from "@shared/types";
import { parsePeerSearch, pickBestMatch } from "@shared/bseShareholding";
import type { Env } from "../env";
import { BSE_API_BASE, bodyString, bseFetch, clientSignalOf } from "./client";

type Handler = (c: Context<{ Bindings: Env }>) => Promise<Response>;

export const NOT_AVAILABLE_MESSAGE =
  "BSE shareholding data is not available for this company.";

/** Best-effort in-isolate cache to avoid re-resolving the same company. */
const resolveCache = new Map<string, { scripCode: string; bseName: string }>();

export interface ResolveInput {
  name: string;
  ticker: string;
  query: string;
}

export type ResolveOutcome =
  | { ok: true; scripCode: string; bseName: string }
  | { ok: false; code: "timeout" | "upstream_error" | "provider_error" | "not_found" };

/**
 * Resolve a company to `{ scripCode, bseName }` via PeerSmartSearch. Reusable by
 * the pattern route when a scrip code isn't supplied directly.
 */
export async function resolveScrip(
  input: ResolveInput,
  signal: AbortSignal | null,
): Promise<ResolveOutcome> {
  const primary = (input.name || input.query || input.ticker).trim();
  const cacheKey = `${primary}|${input.ticker}`.toLowerCase();

  const cached = resolveCache.get(cacheKey);
  if (cached) return { ok: true, ...cached };

  // Candidate search terms, tried in order until one yields a match. BSE's
  // PeerSmartSearch is finicky — e.g. it returns "No Match Found" for names
  // containing "&" (like "Oil & Natural Gas...") that resolve fine by ticker —
  // so we fall back to the ticker and a de-ampersanded name.
  const candidates: string[] = [];
  const addCandidate = (t: string | undefined) => {
    const s = (t ?? "").trim();
    if (s.length >= 2 && !candidates.some((c) => c.toLowerCase() === s.toLowerCase())) {
      candidates.push(s);
    }
  };
  addCandidate(input.name);
  addCandidate(input.ticker);
  addCandidate(input.query);
  if (input.name.includes("&")) addCandidate(input.name.replace(/&/g, " and "));

  let transportError: ResolveOutcome | null = null;

  for (const term of candidates) {
    const res = await bseFetch(
      `${BSE_API_BASE}/PeerSmartSearch/w?Type=SS&text=${encodeURIComponent(term)}`,
      signal,
    );
    if (!res.ok) {
      // A transport failure isn't fatal on its own — try the next candidate.
      transportError = { ok: false, code: res.code };
      continue;
    }
    const best = pickBestMatch(parsePeerSearch(res.text), {
      name: input.name,
      ticker: input.ticker,
      query: input.query || primary,
    });
    if (best) {
      const resolved = { scripCode: best.scripCode, bseName: best.name };
      resolveCache.set(cacheKey, resolved);
      return { ok: true, ...resolved };
    }
  }

  // No candidate matched: surface a transport error if we hit one, else not_found.
  return transportError ?? { ok: false, code: "not_found" };
}

export const bseResolveRoute: Handler = async (c) => {
  const json = (body: BseResolveResponse) => c.json(body);

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return json({
      ok: false,
      code: "invalid_request",
      message: "Could not read the resolve request.",
    });
  }

  const body = payload as { query?: unknown; ticker?: unknown; name?: unknown } | null;
  const input: ResolveInput = {
    name: bodyString(body?.name),
    ticker: bodyString(body?.ticker),
    query: bodyString(body?.query),
  };

  if ((input.name || input.query || input.ticker).length < 2) {
    return json({
      ok: false,
      code: "invalid_request",
      message: "Provide a company name or ticker to resolve.",
    });
  }

  const outcome = await resolveScrip(input, clientSignalOf(c.req.raw));
  if (outcome.ok) {
    return json({ ok: true, scripCode: outcome.scripCode, bseName: outcome.bseName });
  }
  if (outcome.code === "not_found") {
    return json({ ok: false, code: "not_found", message: NOT_AVAILABLE_MESSAGE });
  }
  return json({ ok: false, code: outcome.code, message: bseFailureMessage(outcome.code) });
};

export function bseFailureMessage(code: "timeout" | "upstream_error" | "provider_error"): string {
  switch (code) {
    case "timeout":
      return "BSE took too long to respond. Please try again.";
    case "upstream_error":
      return "BSE is temporarily unavailable. Please try again.";
    default:
      return "Could not read data from BSE. Please try again.";
  }
}
