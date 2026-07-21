// Frontend API client for the Worker proxy.
import type { StockSearchResponse } from "@shared/types";

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
