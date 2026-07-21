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

// ---------------------------------------------------------------------------
// BSE shareholding (added this session)
// ---------------------------------------------------------------------------

/**
 * Failure codes for the BSE-backed routes. Like the search proxy, every failure
 * is an HTTP 200 body. `not_found` is a distinct, non-error signal: the company
 * simply isn't covered by BSE (e.g. non-Indian listings) — the client renders an
 * empty state for it, not the error state.
 */
export type BseErrorCode =
  | "invalid_request"
  | "not_found"
  | "timeout"
  | "upstream_error"
  | "provider_error";

export interface BseResolveSuccess {
  ok: true;
  scripCode: string;
  bseName: string;
}

export interface BseFailure {
  ok: false;
  code: BseErrorCode;
  message: string;
}

/** `POST /api/bse/resolve` response. */
export type BseResolveResponse = BseResolveSuccess | BseFailure;

/** Category totals for a single quarter, as percentages of total capital. */
export interface ShareholdingCategoryBreakdown {
  promoterPct: number; // (A) Promoter & Promoter Group
  publicInstitutionsPct: number; // total institutional public (FII + DII)
  fiiPct: number; // FII / FPI — foreign institutions (subset of institutions)
  diiPct: number; // DII — MFs + banks/FIs + insurance + pension (subset)
  publicNonInstitutionsPct: number; // retail / bodies corporate / NRIs etc.
  othersPct: number; // custodian/employee trusts + govt + non-promoter-non-public
}

export interface ShareholdingQuarter {
  qtrLabel: string; // e.g. "Mar 2025"
  qtrId: string; // BSE quarter id, e.g. "125.00"
  breakdown: ShareholdingCategoryBreakdown;
}

export interface ShareholdingPattern {
  scripCode: string;
  companyName: string;
  latest: ShareholdingQuarter;
  trend: ShareholdingQuarter[]; // oldest -> newest, for the chart
  asOf: string; // ISO fetch timestamp for the source/freshness widget
  partial: boolean; // true when some quarters/fields could not be fetched cleanly
}

export type ShareholdingPatternSuccess = { ok: true } & ShareholdingPattern;

/** `POST /api/shareholding/pattern` response. */
export type ShareholdingPatternResponse = ShareholdingPatternSuccess | BseFailure;
