// Pure normalizer helpers for BSE shareholding-pattern payloads.
//
// BSE's public JSON APIs are outside our control, so — like `stockSearch.ts` —
// these helpers must NEVER throw. Malformed entries degrade to safe defaults
// (empty lists / zeroes) rather than raising.
//
// Confirmed BSE endpoints (base https://api.bseindia.com/BseIndiaAPI/api):
//   PeerSmartSearch/w?Type=SS&text=<q>          -> suggestion markup (name + scrip)
//   SHPQNewFormat/w?scripcode=<code>            -> { Table: [{ qtrid, qtr, ... }] }
//   Corp_shpSec_SHPSUMMARY_ng/w?SCRIPCODE&QtrCode
//        -> Table1 rows: STA1A2 (Promoter), STB1B2B3 (Public), STC1C2 (C/Others)
//   Corp_shpSec_SHPPubShold_ng/w?SCRIPCODE&QtrCode
//        -> Table1 rows incl. "Sub Total" rows tagged by Fld_SubCategory:
//           Institutions (Domestic) = DII, Institutions (Foreign) = FII/FPI,
//           Government, Non-Institutions.

import type {
  IndividualHolder,
  ShareholdingCategoryBreakdown,
  ShareholdingQuarter,
} from "./types";

/** Coerce any value into a safe trimmed string ("" when not a string). */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Coerce any value into a finite number (0 when not parseable). Handles "1,234.5". */
function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number.parseFloat(value.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Resolver (PeerSmartSearch)
// ---------------------------------------------------------------------------

export interface BseSuggestion {
  scripCode: string;
  name: string;
  symbol: string; // NSE symbol embedded in the suggestion, when present
}

/**
 * Parse PeerSmartSearch markup into suggestions. The endpoint returns a
 * JSON-encoded string of `<li>` items, each containing
 * `liclick('<scripCode>','<NAME>')` and a `<span>` whose first token is the NSE
 * symbol, e.g. `RELIANCE&nbsp;&nbsp;&nbsp;INE002A01018&nbsp;&nbsp;&nbsp;500325`.
 * Never throws; unknown shapes yield [].
 */
export function parsePeerSearch(raw: unknown): BseSuggestion[] {
  const out: BseSuggestion[] = [];
  if (typeof raw !== "string") return out;

  for (const chunk of raw.split("<li")) {
    const click = /liclick\('(\d{1,7})'\s*,\s*'([^']*)'\)/.exec(chunk);
    if (!click) continue;
    const scripCode = click[1];
    const name = decodeEntities(click[2]).trim();

    let symbol = "";
    const span = /<span>([\s\S]*?)<\/span>/i.exec(chunk);
    if (span) {
      const text = span[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      symbol = text.split(" ")[0] ?? "";
    }
    out.push({ scripCode, name, symbol });
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeName(s: string): string {
  return s.toUpperCase().replace(/&/g, " AND ").replace(/[^A-Z0-9]+/g, "");
}

const NAME_STOPWORDS = new Set(["LTD", "LIMITED", "THE", "CO", "COMPANY"]);

function nameTokens(s: string): string[] {
  return s
    .toUpperCase()
    .replace(/&/g, " ")
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 2 && !NAME_STOPWORDS.has(t));
}

/**
 * Choose the best suggestion for the requested company. Prefers an exact NSE
 * symbol match to the ticker, then an exact/prefix name match, then token
 * overlap. Returns null when nothing has any signal (so callers can surface a
 * clean "not covered by BSE" result instead of a wrong match).
 */
export function pickBestMatch(
  suggestions: BseSuggestion[],
  req: { name?: string; ticker?: string; query?: string },
): BseSuggestion | null {
  if (suggestions.length === 0) return null;

  const tickerNorm = normalizeName(req.ticker ?? "");
  const reqName = (req.name ?? "").trim() || (req.query ?? "").trim();
  const reqNorm = normalizeName(reqName);
  const reqTokens = nameTokens(reqName);

  let best: BseSuggestion | null = null;
  let bestScore = 0;

  for (const s of suggestions) {
    let score = 0;
    const symNorm = normalizeName(s.symbol);
    const sNorm = normalizeName(s.name);
    const sTokens = nameTokens(s.name);

    if (tickerNorm && symNorm && symNorm === tickerNorm) score += 100;
    if (reqNorm && sNorm === reqNorm) score += 60;
    else if (reqNorm && sNorm && (sNorm.startsWith(reqNorm) || reqNorm.startsWith(sNorm)))
      score += 35;

    const overlap = reqTokens.filter((t) => sTokens.includes(t)).length;
    score += overlap * 10;
    if (reqTokens[0] && sTokens[0] && reqTokens[0] === sTokens[0]) score += 8;

    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }

  // Require at least some signal so unrelated markup never resolves.
  return bestScore > 0 ? best : null;
}

// ---------------------------------------------------------------------------
// Quarter list (SHPQNewFormat)
// ---------------------------------------------------------------------------

export interface BseQuarter {
  qtrId: string; // e.g. "125.00"
  qtrLabel: string; // e.g. "Mar 2025"
}

const MONTHS: Record<string, string> = {
  JANUARY: "Jan",
  FEBRUARY: "Feb",
  MARCH: "Mar",
  APRIL: "Apr",
  MAY: "May",
  JUNE: "Jun",
  JULY: "Jul",
  AUGUST: "Aug",
  SEPTEMBER: "Sep",
  OCTOBER: "Oct",
  NOVEMBER: "Nov",
  DECEMBER: "Dec",
};

const MONTH_BY_NUM = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortMonth(name: string): string {
  return MONTHS[name.toUpperCase()] ?? name.slice(0, 3);
}

/**
 * Normalize BSE quarter labels to a clean, consistent form. Handles the standard
 * quarter-ends ("June 2026" -> "Jun 2026"), interim date-style labels
 * ("04 Dec 2025" -> "4 Dec 2025"), and ISO dates ("2025-12-04" -> "4 Dec 2025").
 * Falls back to the raw string when unparseable — never emits a broken partial.
 */
export function shortQuarterLabel(qtr: string): string {
  const s = qtr.trim();
  if (!s) return s;

  // "Month YYYY"
  let m = /^([A-Za-z]+)\s+(\d{4})$/.exec(s);
  if (m) return `${shortMonth(m[1])} ${m[2]}`;

  // "DD Month YYYY" (interim / revised filing)
  m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(s);
  if (m) return `${Number(m[1])} ${shortMonth(m[2])} ${m[3]}`;

  // ISO "YYYY-MM-DD"
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) {
    const mon = MONTH_BY_NUM[Number(m[2])];
    if (mon) return `${Number(m[3])} ${mon} ${m[1]}`;
  }

  return s;
}

/**
 * Split a quarter label into two-line axis-tick parts: [primary, year]. The year
 * is the trailing token; everything before it is the primary line. Works for
 * both "Jun 2026" -> ["Jun","2026"] and "4 Dec 2025" -> ["4 Dec","2025"].
 */
export function quarterAxisParts(label: string): [string, string] {
  const parts = label.trim().split(/\s+/);
  if (parts.length <= 1) return [label.trim(), ""];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}

/** Format a BSE numeric quarter id (e.g. 130 / "130.0") as "130.00". */
export function formatQtrId(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
  const s = asString(value).trim();
  if (!s) return "";
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n.toFixed(2) : s;
}

/** Extract the quarter list (newest first, as BSE returns it). Never throws. */
export function extractQuarters(raw: unknown): BseQuarter[] {
  const table = (raw as { Table?: unknown } | null | undefined)?.Table;
  if (!Array.isArray(table)) return [];

  const out: BseQuarter[] = [];
  for (const row of table as Record<string, unknown>[]) {
    const qtrId = formatQtrId(row?.qtrid);
    if (!qtrId) continue;
    out.push({ qtrId, qtrLabel: shortQuarterLabel(asString(row?.qtr)) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Category summary (Corp_shpSec_SHPSUMMARY_ng) + public split (SHPPubShold)
// ---------------------------------------------------------------------------

export interface SummaryTotals {
  promoterPct: number;
  publicPct: number;
  othersPct: number; // (C) Non Promoter-Non Public
}

const PCT_FIELD = "Fld_TotalPercentageOf_A_B_C2";

/**
 * Pull Promoter (STA1A2), Public (STB1B2B3) and Non-Promoter-Non-Public
 * (STC1C2) totals from the summary Table1. Returns null if none are present.
 */
export function extractSummaryTotals(raw: unknown): SummaryTotals | null {
  const table = (raw as { Table1?: unknown } | null | undefined)?.Table1;
  if (!Array.isArray(table)) return null;

  let promoter = NaN;
  let publicPct = NaN;
  let others = 0;

  for (const row of table as Record<string, unknown>[]) {
    const code = asString(row?.Fld_Code).trim();
    const pct = asNumber(row?.[PCT_FIELD]);
    if (code === "STA1A2") promoter = pct;
    else if (code === "STB1B2B3") publicPct = pct;
    else if (code === "STC1C2") others = pct;
  }

  if (!Number.isFinite(promoter) && !Number.isFinite(publicPct)) return null;
  return {
    promoterPct: Number.isFinite(promoter) ? promoter : 0,
    publicPct: Number.isFinite(publicPct) ? publicPct : 0,
    othersPct: others,
  };
}

export interface PublicSplit {
  fiiPct: number;
  diiPct: number;
  govtPct: number;
  nonInstPct: number;
  found: boolean; // whether any subtotal row was recognised
}

/**
 * Read the FII / DII / Government / Non-Institutions split from the public
 * shareholding table's "Sub Total" rows, classified by `Fld_SubCategory`:
 *   Institutions (Domestic) -> DII, Institutions (Foreign) -> FII/FPI,
 *   Government -> govt, Non-Institutions -> nonInst.
 */
export function extractPublicSplit(raw: unknown): PublicSplit {
  const table = (raw as { Table1?: unknown } | null | undefined)?.Table1;
  const split: PublicSplit = {
    fiiPct: 0,
    diiPct: 0,
    govtPct: 0,
    nonInstPct: 0,
    found: false,
  };
  if (!Array.isArray(table)) return split;

  for (const row of table as Record<string, unknown>[]) {
    const level = asString(row?.Fld_Level).trim().toLowerCase();
    if (!level.startsWith("sub total")) continue;

    const sub = asString(row?.Fld_SubCategory).toLowerCase();
    const pct = asNumber(row?.[PCT_FIELD]);

    if (sub.includes("domestic")) {
      split.diiPct = pct;
      split.found = true;
    } else if (sub.includes("foreign")) {
      split.fiiPct = pct;
      split.found = true;
    } else if (sub.includes("government")) {
      split.govtPct = pct;
      split.found = true;
    } else if (sub.includes("non-institution") || sub.includes("non institution")) {
      split.nonInstPct = pct;
      split.found = true;
    }
  }
  return split;
}

/** Combine the summary totals + public split into the normalized breakdown. */
export function buildBreakdown(
  summary: SummaryTotals | null,
  split: PublicSplit,
): ShareholdingCategoryBreakdown {
  const promoterPct = summary ? summary.promoterPct : 0;
  const fiiPct = split.fiiPct;
  const diiPct = split.diiPct;
  const publicInstitutionsPct = fiiPct + diiPct;
  const publicNonInstitutionsPct = split.nonInstPct;
  const othersPct = (summary ? summary.othersPct : 0) + split.govtPct;

  return {
    promoterPct: round2(promoterPct),
    publicInstitutionsPct: round2(publicInstitutionsPct),
    fiiPct: round2(fiiPct),
    diiPct: round2(diiPct),
    publicNonInstitutionsPct: round2(publicNonInstitutionsPct),
    othersPct: round2(othersPct),
  };
}

/** Total non-promoter public float (institutions + non-institutions). */
export function publicFloatPct(b: ShareholdingCategoryBreakdown): number {
  return round2(b.publicInstitutionsPct + b.publicNonInstitutionsPct);
}

/**
 * The "remainder" slice used to close a 4-way stacked chart (Promoter / FII /
 * DII / everything-else) to ~100%. Kept non-negative.
 */
export function stackRemainderPct(b: ShareholdingCategoryBreakdown): number {
  return round2(Math.max(0, 100 - b.promoterPct - b.fiiPct - b.diiPct));
}

/** A quarter's breakdown is meaningful if any category is non-zero. */
export function isMeaningfulBreakdown(b: ShareholdingCategoryBreakdown): boolean {
  return (
    b.promoterPct > 0 ||
    b.publicInstitutionsPct > 0 ||
    b.publicNonInstitutionsPct > 0 ||
    b.othersPct > 0
  );
}

/** True when a quarter's slices sum close to 100% (within 3 pts). */
export function breakdownSumsToWhole(b: ShareholdingCategoryBreakdown): boolean {
  const sum =
    b.promoterPct +
    b.fiiPct +
    b.diiPct +
    b.publicNonInstitutionsPct +
    b.othersPct;
  return Math.abs(sum - 100) <= 3;
}

/** QoQ delta in percentage points between two quarters for a category. */
export function qoqDelta(
  latest: ShareholdingQuarter,
  prior: ShareholdingQuarter | undefined,
  pick: (b: ShareholdingCategoryBreakdown) => number,
): number | null {
  if (!prior) return null;
  return round2(pick(latest.breakdown) - pick(prior.breakdown));
}

// ---------------------------------------------------------------------------
// Individual holders
//   Corp_shpPromoterNGroup_ng -> named promoter & promoter-group entities
//   Corp_shpSec_SHPPubShold_ng -> named public/institutional holders (reused)
// ---------------------------------------------------------------------------

export const HOLDERS_DISCLOSURE_NOTE =
  "Public & institutional holders are disclosed by BSE only above 1% of total shares; promoter-group entities are listed in full.";

const NAME_FIELD = "Fld_ShareHolderName";
const SHARES_FIELD = "Fld_TotalNoOfShares";

/** Coerce a value to a number only when it is genuinely numeric, else undefined. */
function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseFloat(value.replace(/,/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** True for aggregate "Sub Total" / grand-total rows (never individual holders). */
function isSubtotalRow(row: Record<string, unknown>): boolean {
  const level = asString(row?.Fld_Level).trim().toLowerCase();
  const code = asString(row?.Fld_Code).trim();
  return level.startsWith("sub total") || code.startsWith("ST");
}

/** Sort holders by percentage held, descending (stable for equal values). */
export function sortHoldersByPct(list: IndividualHolder[]): IndividualHolder[] {
  return [...list].sort((a, b) => b.pct - a.pct);
}

/**
 * Extract named promoter & promoter-group entities from
 * `Corp_shpPromoterNGroup_ng`. Skips category/subtotal rows and zero-holding
 * entries. Captures pledge/encumbrance % only when BSE actually discloses it.
 */
export function extractPromoterHolders(raw: unknown): IndividualHolder[] {
  const table = (raw as { Table1?: unknown } | null | undefined)?.Table1;
  if (!Array.isArray(table)) return [];

  const holders: IndividualHolder[] = [];
  for (const row of table as Record<string, unknown>[]) {
    const name = asString(row?.[NAME_FIELD]).trim();
    if (!name || isSubtotalRow(row)) continue;

    const sharesHeld = asNumber(row?.[SHARES_FIELD]);
    if (sharesHeld <= 0) continue; // a holder of 0 shares is not a holder

    // Prefer total encumbrance; fall back to the narrower pledge field.
    const pledgedPct =
      asOptionalNumber(row?.Fld_TotalencumberedPercentage) ??
      asOptionalNumber(row?.Fld_PledgeEncumberedPercentage);

    holders.push({
      name,
      category: "promoter",
      sharesHeld,
      pct: round2(asNumber(row?.[PCT_FIELD])),
      ...(pledgedPct === undefined ? {} : { pledgedPct: round2(pledgedPct) }),
    });
  }
  return sortHoldersByPct(holders);
}

/**
 * Extract named public/institutional holders from `Corp_shpSec_SHPPubShold_ng`,
 * classifying each into fii / dii / publicOther. Rows are grouped by the section
 * they belong to: named rows are buffered until the section's "Sub Total" row is
 * reached, then assigned by its `Fld_SubCategory` (Institutions Foreign -> FII,
 * Institutions Domestic -> DII, Government / Non-Institutions -> publicOther) —
 * the same classification the subtotal splitter uses.
 */
export function extractPublicHolders(raw: unknown): {
  fii: IndividualHolder[];
  dii: IndividualHolder[];
  publicOther: IndividualHolder[];
} {
  const table = (raw as { Table1?: unknown } | null | undefined)?.Table1;
  const groups = {
    fii: [] as IndividualHolder[],
    dii: [] as IndividualHolder[],
    publicOther: [] as IndividualHolder[],
  };
  if (!Array.isArray(table)) return groups;

  const sectionOf = (sub: string): "fii" | "dii" | "publicOther" => {
    const s = sub.toLowerCase();
    if (s.includes("domestic")) return "dii";
    if (s.includes("foreign")) return "fii";
    return "publicOther"; // government / non-institutions / anything else public
  };

  let buffer: IndividualHolder[] = [];
  const flush = (target: "fii" | "dii" | "publicOther") => {
    if (buffer.length) {
      groups[target].push(...buffer);
      buffer = [];
    }
  };

  for (const row of table as Record<string, unknown>[]) {
    if (isSubtotalRow(row)) {
      flush(sectionOf(asString(row?.Fld_SubCategory)));
      continue;
    }
    const name = asString(row?.[NAME_FIELD]).trim();
    if (!name) continue; // category header rows carry no name

    const sharesHeld = asNumber(row?.[SHARES_FIELD]);
    if (sharesHeld <= 0) continue;

    buffer.push({
      name,
      category: "public", // refined below when assigned to fii/dii
      sharesHeld,
      pct: round2(asNumber(row?.[PCT_FIELD])),
    });
  }
  // Anything after the last subtotal (defensive) is public.
  flush("publicOther");

  // Stamp the correct category on the institution groups.
  groups.fii = groups.fii.map((h) => ({ ...h, category: "fii" as const }));
  groups.dii = groups.dii.map((h) => ({ ...h, category: "dii" as const }));

  return {
    fii: sortHoldersByPct(groups.fii),
    dii: sortHoldersByPct(groups.dii),
    publicOther: sortHoldersByPct(groups.publicOther),
  };
}
