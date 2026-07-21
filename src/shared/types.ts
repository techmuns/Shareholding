// Shared types used by BOTH the React app and the Cloudflare Worker.

/** A single normalized stock/company search result. */
export interface StockSearchResult {
  ticker: string;
  name: string;
  country: string;
  sector: string;
}

/**
 * Failure codes returned by the stock search proxy. Every failure is delivered
 * as an HTTP 200 body so the client never has to branch on transport status.
 */
export type StockSearchErrorCode =
  | "not_configured"
  | "timeout"
  | "upstream_error"
  | "provider_error"
  | "invalid_request";

export interface StockSearchSuccess {
  ok: true;
  query: string;
  totalResults: number;
  results: StockSearchResult[];
}

export interface StockSearchFailure {
  ok: false;
  code: StockSearchErrorCode;
  message: string;
}

/** Safe-failure contract: the client renders either shape without throwing. */
export type StockSearchResponse = StockSearchSuccess | StockSearchFailure;

/** The company the user has picked on the home screen (app-local selection). */
export interface SelectedCompany {
  ticker: string;
  name: string;
  country: string;
  sector: string;
}
