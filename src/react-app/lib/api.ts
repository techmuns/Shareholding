// Frontend API client for the Worker proxy.
import type {
  BseResolveResponse,
  HoldersResponse,
  ShareholdingPatternResponse,
  StockSearchResponse,
} from "@shared/types";

/**
 * POST /api/stock/search. Always resolves to a `StockSearchResponse` (the proxy
 * uses the safe-failure contract). On a genuine network failure it synthesizes a
 * `provider_error`. If the request was aborted (stale query), the underlying
 * AbortError is re-thrown so the caller can ignore it.
 */
export async function searchStocks(
  query: string,
  signal?: AbortSignal,
): Promise<StockSearchResponse> {
  try {
    const res = await fetch("/api/stock/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal,
    });
    return (await res.json()) as StockSearchResponse;
  } catch (err) {
    if (signal?.aborted) throw err;
    return {
      ok: false,
      code: "provider_error",
      message: "Could not reach the search service. Please try again.",
    };
  }
}

/**
 * POST /api/bse/resolve — resolve a company (name/ticker) to a BSE scrip code.
 * Same safe-failure semantics as `searchStocks`.
 */
export async function resolveBseScrip(
  input: { query?: string; ticker?: string; name?: string },
  signal?: AbortSignal,
): Promise<BseResolveResponse> {
  try {
    const res = await fetch("/api/bse/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
    return (await res.json()) as BseResolveResponse;
  } catch (err) {
    if (signal?.aborted) throw err;
    return {
      ok: false,
      code: "provider_error",
      message: "Could not reach BSE. Please try again.",
    };
  }
}

/**
 * POST /api/shareholding/pattern — normalized BSE shareholding pattern.
 * Accepts a scrip code, or a company name/ticker to resolve server-side.
 */
export async function getShareholdingPattern(
  input: { scripCode?: string; query?: string; ticker?: string; name?: string },
  signal?: AbortSignal,
): Promise<ShareholdingPatternResponse> {
  try {
    const res = await fetch("/api/shareholding/pattern", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
    return (await res.json()) as ShareholdingPatternResponse;
  } catch (err) {
    if (signal?.aborted) throw err;
    return {
      ok: false,
      code: "provider_error",
      message: "Could not reach BSE. Please try again.",
    };
  }
}

/**
 * POST /api/shareholding/holders — named individual holders (promoters, FII/FPI,
 * DII, other public) for the latest quarter. Accepts a scrip code, or a company
 * name/ticker to resolve server-side.
 */
export async function getShareholdingHolders(
  input: { scripCode?: string; query?: string; ticker?: string; name?: string; qtrId?: string },
  signal?: AbortSignal,
): Promise<HoldersResponse> {
  try {
    const res = await fetch("/api/shareholding/holders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
    return (await res.json()) as HoldersResponse;
  } catch (err) {
    if (signal?.aborted) throw err;
    return {
      ok: false,
      code: "provider_error",
      message: "Could not reach BSE. Please try again.",
    };
  }
}
