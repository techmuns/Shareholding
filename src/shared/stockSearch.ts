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

// A real stock ticker / symbol is short (the longest legitimate NSE/BSE symbols
// are well under this). The upstream index occasionally contains free-text test
// rows whose "ticker" is an entire sentence — we drop anything implausible so
// junk never reaches the dropdown.
const MAX_TICKER_LEN = 25;

/** True for a result that looks like a real company (not a junk/test row). */
function isPlausible(ticker: string): boolean {
  return ticker.length > 0 && ticker.length <= MAX_TICKER_LEN;
}

/**
 * Flatten `data.results` (ticker -> [country, name, sector]) into a list of
 * normalized {ticker, name, country, sector} entries, dropping implausible
 * (junk/test) rows. Never throws.
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

  for (const [tickerRaw, tuple] of Object.entries(resultMap as Record<string, unknown>)) {
    const ticker = asString(tickerRaw).trim();
    if (!isPlausible(ticker)) continue; // skip free-text / test rows

    const row = Array.isArray(tuple) ? tuple : [];
    results.push({
      ticker,
      country: asString(row[0]).trim(),
      name: asString(row[1]).trim(),
      sector: asString(row[2]).trim(),
    });
  }

  return results;
}
