// POST /api/stock/search — proxy to the upstream Munshot stock search.
//
// Why a proxy: the upstream requires a bearer token that must never reach the
// browser. The client only sends `{ query }`; the Worker injects the secret and
// the fixed `user_index` constant the client cannot influence.
//
// SAFE-FAILURE CONTRACT: every path returns HTTP 200. Success is
// `{ ok:true, ... }`; failures are `{ ok:false, code, message }`. The client
// renders an inline hint and never throws.
//
// SECURITY: never log the token, the Authorization header, or the upstream body.

import type { Context } from "hono";
import { normalizeStockResults, extractTotalResults } from "@shared/stockSearch";
import type { StockSearchResponse } from "@shared/types";
import type { Env } from "../env";

const UPSTREAM_URL = "https://devde.muns.io/stock/search";
/** Fixed constant — the client can never influence this. */
const USER_INDEX = 124;
const UPSTREAM_TIMEOUT_MS = 15_000;
const MIN_QUERY_LENGTH = 2;

type Handler = (c: Context<{ Bindings: Env }>) => Promise<Response>;

export const stockSearchRoute: Handler = async (c) => {
  const json = (body: StockSearchResponse) => c.json(body);

  // ---- Parse & validate input -------------------------------------------
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    return json({
      ok: false,
      code: "invalid_request",
      message: "Could not read the search request.",
    });
  }

  const rawQuery = (payload as { query?: unknown } | null)?.query;
  const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
  if (query.length < MIN_QUERY_LENGTH) {
    return json({
      ok: false,
      code: "invalid_request",
      message: `Type at least ${MIN_QUERY_LENGTH} characters to search.`,
    });
  }

  // ---- Ensure the secret is configured ----------------------------------
  const token = c.env.MUNS_ACCESS_TOKEN;
  if (!token) {
    return json({
      ok: false,
      code: "not_configured",
      message:
        "Search is not configured yet. Set the MUNS_ACCESS_TOKEN secret to enable company search.",
    });
  }

  // ---- Call upstream with a 15s timeout, forwarding client abort --------
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, UPSTREAM_TIMEOUT_MS);

  const clientSignal = (c.req.raw as Request & { signal?: AbortSignal }).signal;
  if (clientSignal) {
    if (clientSignal.aborted) controller.abort();
    else clientSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const upstream = await fetch(UPSTREAM_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, user_index: USER_INDEX }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      return json({
        ok: false,
        code: "upstream_error",
        message: "The search provider is temporarily unavailable. Please try again.",
      });
    }

    let raw: unknown;
    try {
      raw = await upstream.json();
    } catch {
      return json({
        ok: false,
        code: "provider_error",
        message: "The search provider returned an unreadable response.",
      });
    }

    const results = normalizeStockResults(raw);
    const totalResults = extractTotalResults(raw, results.length);

    return json({ ok: true, query, totalResults, results });
  } catch {
    if (timedOut) {
      return json({
        ok: false,
        code: "timeout",
        message: "The search took too long to respond. Please try again.",
      });
    }
    // Client aborted (stale request) or the fetch failed for another reason.
    return json({
      ok: false,
      code: "provider_error",
      message: "Could not reach the search provider. Please try again.",
    });
  } finally {
    clearTimeout(timeout);
  }
};
