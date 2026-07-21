// Pure normalizer helpers for insider-trading (SEBI PIT Reg 7(2)) payloads.
//
// Like the other BSE/NSE normalizers, these must NEVER throw — malformed entries
// degrade to safe defaults rather than raising.
//
// Confirmed sources:
//   BSE  InsiderTrade15/w?fromdt=&todt=&pageno=1&scripcode=<code>
//        -> { Table: [ SEBI PIT 2015 (Reg 7(2)) continual disclosures ] }
//        Fields: Fld_PromoterName, Fld_PersonCatgName, Fld_TransactionType,
//        Fld_SecurityNo, Fld_SecurityValue, Fld_PercentofShareholdingPost,
//        Fld_FromDate, Fld_ToDate, Fld_LetterDate, ModeOfAquisation,
//        Fld_SecurityTypeName.
//   NSE  /api/corporate-insider-trading?index=equities&symbol=<SYM>
//        -> { data: [ { acqName, personCategory, secAcq, tdpTransactionType,
//        acqMode, secVal, afterAcqSharesPer, date/intimDate, … } ] }
//        (best-effort; NSE frequently blocks datacenter egress IPs.)

import type { InsiderTrade, InsiderTxnType } from "./types";

function asString(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number.parseFloat(value.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Optional number: undefined unless a genuine finite value is present. */
function optNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number.parseFloat(value.replace(/,/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function optString(value: unknown): string | undefined {
  const s = asString(value).trim();
  return s === "" ? undefined : s;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Parse an insider date into epoch ms, or null if unparseable. Tolerant. */
export function parseInsiderDateMs(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;

  const iso = Date.parse(s); // handles "2026-06-23T00:00:00", "2026-06-23"
  if (!Number.isNaN(iso)) return iso;

  // dd/MM/yyyy | dd-MM-yyyy | dd-Mon-yyyy
  const m = /^(\d{1,2})[/-]([A-Za-z]{3,}|\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) {
    const day = Number(m[1]);
    const yr = Number(m[3]);
    const monPart = m[2];
    const mon = /^\d+$/.test(monPart) ? Number(monPart) - 1 : MONTHS[monPart.slice(0, 3).toLowerCase()];
    if (mon != null && mon >= 0 && mon <= 11) {
      const t = Date.UTC(yr, mon, day);
      if (!Number.isNaN(t)) return t;
    }
  }
  return null;
}

/** Normalize a date to an ISO calendar date (YYYY-MM-DD); falls back to raw. */
function toIsoDate(raw: string): string {
  const ms = parseInsiderDateMs(raw);
  if (ms == null) return raw.trim();
  return new Date(ms).toISOString().slice(0, 10);
}

/** Map an exchange's raw transaction type / mode into our canonical enum. */
export function mapTxnType(rawType: string, mode = ""): InsiderTxnType {
  const s = `${rawType} ${mode}`.toLowerCase();
  if (/(revoc|revoke|release)/.test(s)) return "revoke";
  if (/(pledge|encumbr|invoc|lien)/.test(s)) return "pledge";
  if (/(acqui|buy|purchas|allot|subscrib|invest|gift.*receiv)/.test(s)) return "buy";
  if (/(dispos|sold|sell|sale|transfer|off.?load)/.test(s)) return "sell";
  return "other";
}

/** Normalize BSE InsiderTrade15 (`{ Table: [...] }`) into InsiderTrade[]. */
export function normalizeBseInsider(raw: unknown): InsiderTrade[] {
  const table = (raw as { Table?: unknown } | null | undefined)?.Table;
  if (!Array.isArray(table)) return [];

  const out: InsiderTrade[] = [];
  for (const row of table as Record<string, unknown>[]) {
    const personName = asString(row?.Fld_PromoterName).trim();
    if (!personName) continue;

    const mode = asString(row?.ModeOfAquisation).trim() || asString(row?.Fld_Mode).trim();
    out.push({
      personName,
      personCategory: optString(row?.Fld_PersonCatgName),
      transactionType: mapTxnType(asString(row?.Fld_TransactionType), mode),
      securityType: optString(row?.Fld_SecurityTypeName),
      quantity: asNumber(row?.Fld_SecurityNo),
      value: optNumber(row?.Fld_SecurityValue),
      sharesAfterPct: optNumber(row?.Fld_PercentofShareholdingPost),
      mode: optString(row?.ModeOfAquisation),
      periodFrom: row?.Fld_FromDate ? toIsoDate(asString(row.Fld_FromDate)) : undefined,
      periodTo: row?.Fld_ToDate ? toIsoDate(asString(row.Fld_ToDate)) : undefined,
      disclosureDate: toIsoDate(asString(row?.Fld_LetterDate) || asString(row?.Fld_DateIntimation)),
      source: "BSE",
    });
  }
  return out;
}

/** Normalize NSE corporate-insider-trading (`{ data: [...] }`) into InsiderTrade[]. */
export function normalizeNseInsider(raw: unknown): InsiderTrade[] {
  const data = (raw as { data?: unknown } | null | undefined)?.data;
  if (!Array.isArray(data)) return [];

  const out: InsiderTrade[] = [];
  for (const row of data as Record<string, unknown>[]) {
    const personName = asString(row?.acqName).trim();
    if (!personName) continue;

    const rawType = asString(row?.tdpTransactionType) || asString(row?.acqMode);
    const mode = asString(row?.acqMode) || asString(row?.tdpTransactionType);
    out.push({
      personName,
      personCategory: optString(row?.personCategory),
      transactionType: mapTxnType(rawType, mode),
      securityType: optString(row?.secType),
      quantity: asNumber(row?.secAcq),
      value: optNumber(row?.secVal),
      sharesAfterPct: optNumber(row?.afterAcqSharesPer),
      mode: optString(row?.acqMode),
      periodFrom: row?.fromDate ? toIsoDate(asString(row.fromDate)) : undefined,
      periodTo: row?.toDate ? toIsoDate(asString(row.toDate)) : undefined,
      disclosureDate: toIsoDate(asString(row?.date) || asString(row?.intimDate) || asString(row?.acqfromDt)),
      source: "NSE",
    });
  }
  return out;
}

/** Dedupe key: same person + date + quantity + type is the same disclosure. */
function tradeKey(t: InsiderTrade): string {
  return `${t.personName.toLowerCase()}|${t.disclosureDate}|${t.quantity}|${t.transactionType}`;
}

/**
 * Merge trades from both feeds: keep those disclosed within [fromMs, toMs]
 * (rows with an unparseable date are kept), dedupe near-identical rows, and sort
 * newest disclosure first. Pure — the caller supplies the window bounds.
 */
export function mergeInsiderTrades(
  trades: InsiderTrade[],
  fromMs: number,
  toMs: number,
): InsiderTrade[] {
  const seen = new Set<string>();
  const kept: InsiderTrade[] = [];

  for (const t of trades) {
    const ms = parseInsiderDateMs(t.disclosureDate);
    if (ms != null && (ms < fromMs || ms > toMs)) continue; // outside window
    const key = tradeKey(t);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(t);
  }

  kept.sort((a, b) => {
    const am = parseInsiderDateMs(a.disclosureDate);
    const bm = parseInsiderDateMs(b.disclosureDate);
    if (am == null && bm == null) return 0;
    if (am == null) return 1; // unparseable dates sink to the bottom
    if (bm == null) return -1;
    return bm - am; // newest first
  });

  return kept;
}
