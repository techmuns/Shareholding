// Pure normalizer helpers for the upstream stock-search payload.
//
// The upstream (`https://birdnest.muns.io/stock/search`) is outside our control,
// so these helpers must NEVER throw. Malformed entries degrade to empty
// strings and unknown shapes yield an empty result set. A `null` sector (seen
// in the wild) safely becomes "".
//
// Upstream response shape (example query "RELI"):
//   {
//     "data": {
//       "total_results": 15,
//       "results": {
//         "RELIANCE": ["India", "Reliance Industries Ltd", "Refineries & Marketing"],
//         ...
//       }
//     },
//     "success": true
//   }
// Each results value is the positional tuple [country, name, sector].

import type { StockSearchResult } from "./types";

/** Coerce any value into a safe string ("" when not a string). */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Flatten `data.results` (ticker -> [country, name, sector]) into a list of
 * normalized {ticker, name, country, sector} entries. Never throws.
 */
export function normalizeStockResults(raw: unknown): StockSearchResult[] {
  const results: StockSearchResult[] = [];

  const data = (raw as { data?: unknown } | null | undefined)?.data as
    | { results?: unknown }
    | undefined;
  const resultMap = data?.results;

  if (!resultMap || typeof resultMap !== "object") {
    return results;
  }

  for (const [ticker, tuple] of Object.entries(resultMap as Record<string, unknown>)) {
    const row = Array.isArray(tuple) ? tuple : [];
    results.push({
      ticker: asString(ticker),
      country: asString(row[0]),
      name: asString(row[1]),
      sector: asString(row[2]),
    });
  }

  return results;
}

/**
 * Extract `data.total_results`, falling back to the parsed row count when the
 * field is missing or not a finite number.
 */
export function extractTotalResults(raw: unknown, fallbackCount: number): number {
  const total = (raw as { data?: { total_results?: unknown } } | null | undefined)?.data
    ?.total_results;
  return typeof total === "number" && Number.isFinite(total) ? total : fallbackCount;
}
