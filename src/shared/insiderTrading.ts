// Pure normalizer helpers for insider-trading (SEBI PIT) payloads.
//
// These must NEVER throw — malformed entries degrade to safe defaults.
//
// Source: the Munshot filings API
//   POST https://devde.muns.io/filings/data/insider_trades  { ticker, country }
// returns rows with columns like: Company, Insider, Category, Security Type,
// Transaction (Acquisition/Disposal/Pledge/Revoke), Trade Shares, Trade %,
// Trade Value, Post Holding Shares, Post Holding %, Mode, From Date, To Date,
// Broadcast Date, Source (e.g. TRENDLYNE). The exact JSON key casing/shape is
// matched defensively (normalized-key aliases + several container shapes).

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

/** Normalize a header label / key: lowercase, "%"/"percent" -> "pct", strip rest. */
function normKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/percent/g, "pct")
    .replace(/%/g, "pct")
    .replace(/[^a-z0-9]/g, "");
}

/** Build a normalized-key getter over a row; prefers non-empty candidates. */
function rowGetter(row: Record<string, unknown>): (candidates: string[]) => unknown {
  const map: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) map[normKey(k)] = v;
  return (candidates) => {
    for (const c of candidates) {
      const v = map[c];
      if (v !== undefined && v !== null && v !== "") return v;
    }
    for (const c of candidates) if (c in map) return map[c];
    return undefined;
  };
}

/** Zip parallel `columns` + array-of-arrays `rows` into row objects. */
function zipRows(cols: unknown, rows: unknown): Record<string, unknown>[] {
  if (!Array.isArray(cols) || !Array.isArray(rows)) return [];
  return rows
    .filter((r): r is unknown[] => Array.isArray(r))
    .map((r) => {
      const obj: Record<string, unknown> = {};
      cols.forEach((c, i) => {
        obj[asString(c)] = r[i];
      });
      return obj;
    });
}

/** True array-of-objects (not array-of-arrays); null otherwise. */
function asObjectRows(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return [];
  if (Array.isArray(value[0])) return null;
  return value.filter((r) => r && typeof r === "object") as Record<string, unknown>[];
}

/** Locate the list of insider rows across the shapes the API might return. */
function extractInsiderRows(raw: unknown): Record<string, unknown>[] {
  const direct = asObjectRows(raw);
  if (direct) return direct;

  const r = (raw ?? {}) as Record<string, unknown>;
  const data = r.data;

  const dataObjs = asObjectRows(data);
  if (dataObjs) return dataObjs;

  if (Array.isArray(data) && Array.isArray(data[0])) {
    return zipRows(r.columns ?? r.headers, data);
  }

  if (data && typeof data === "object") {
    const dd = data as Record<string, unknown>;
    const cols = dd.columns ?? dd.headers;
    const rows = dd.rows ?? dd.data ?? dd.records ?? dd.results;
    if (Array.isArray(cols) && Array.isArray(rows) && Array.isArray(rows[0])) return zipRows(cols, rows);
    const objRows = asObjectRows(rows);
    if (objRows) return objRows;
  }

  for (const key of ["rows", "results", "records", "insider_trades", "insiderTrades", "trades"]) {
    const objRows = asObjectRows(r[key]);
    if (objRows) return objRows;
  }
  return [];
}

function dateOrUndefined(value: unknown): string | undefined {
  const s = asString(value).trim();
  return s ? toIsoDate(s) : undefined;
}

/** Split a Markdown table row into trimmed cell values (drops the outer pipes). */
function splitMdCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

/** Zip one contiguous Markdown table block (lines starting with "|") into objects. */
function tableBlockToObjects(block: string[]): Record<string, unknown>[] {
  if (block.length < 2) return [];
  const header = splitMdCells(block[0]);
  if (header.length < 2) return [];

  // A row of only dashes/colons/pipes is the header separator — skip it.
  let start = 1;
  if (block[1] && /^[\s|:-]+$/.test(block[1]) && block[1].includes("-")) start = 2;

  const out: Record<string, unknown>[] = [];
  for (let i = start; i < block.length; i++) {
    const cells = splitMdCells(block[i]);
    if (cells.every((c) => c === "")) continue;
    const obj: Record<string, unknown> = {};
    header.forEach((h, idx) => {
      obj[h || `col${idx}`] = cells[idx] ?? "";
    });
    out.push(obj);
  }
  return out;
}

/**
 * Parse insider rows from a Markdown document (the `insider_trades` endpoint
 * returns a Markdown table, not JSON). Finds every contiguous table block and
 * returns the best candidate — an insider-shaped header wins, else the largest.
 * Keys rows by the raw header text; `normalizeMunshotInsider` normalizes them.
 * Never throws.
 */
export function parseInsiderMarkdownRows(markdown: string): Record<string, unknown>[] {
  const lines = (markdown ?? "").split(/\r?\n/);
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (line.trim().startsWith("|")) {
      cur.push(line);
    } else if (cur.length) {
      blocks.push(cur);
      cur = [];
    }
  }
  if (cur.length) blocks.push(cur);

  let best: Record<string, unknown>[] = [];
  let bestScore = -1;
  for (const block of blocks) {
    const rows = tableBlockToObjects(block);
    if (rows.length === 0) continue;
    const headerKeys = Object.keys(rows[0]).map(normKey);
    const insiderish = headerKeys.some(
      (k) => k.includes("insider") || k.includes("transaction") || k.includes("tradeshares"),
    );
    const score = rows.length + (insiderish ? 100000 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = rows;
    }
  }
  return best;
}

/**
 * Normalize the Munshot `insider_trades` payload into InsiderTrade[]. Matches
 * fields by normalized-key aliases so it works whether the API returns display
 * labels ("Trade Shares"), snake_case (`trade_shares`), or camelCase. Never throws.
 */
export function normalizeMunshotInsider(raw: unknown): InsiderTrade[] {
  const out: InsiderTrade[] = [];
  for (const row of extractInsiderRows(raw)) {
    const get = rowGetter(row);
    const personName = asString(get(["insider", "insidername", "name", "acqname", "personname"])).trim();
    if (!personName) continue;

    const rawType = asString(get(["transaction", "transactiontype", "tdptransactiontype", "type", "txntype"]));
    const mode = asString(get(["mode", "acqmode", "modeofacquisition", "transactionmode"]));

    out.push({
      personName,
      personCategory: optString(
        get(["category", "personcategory", "insidercategory", "relationship", "persontype"]),
      ),
      transactionType: mapTxnType(rawType, mode),
      securityType: optString(get(["securitytype", "sectype", "security", "instrument"])),
      quantity: asNumber(get(["tradeshares", "shares", "quantity", "secacq", "noofshares", "tradedshares"])),
      value: optNumber(get(["tradevalue", "value", "secval", "transactionvalue", "tradedvalue"])),
      sharesAfterPct: optNumber(
        get(["postholdingpct", "holdingafterpct", "sharesafterpct", "afteracqsharesper", "postpct"]),
      ),
      mode: optString(get(["mode", "acqmode", "modeofacquisition", "transactionmode"])),
      periodFrom: dateOrUndefined(get(["fromdate", "from", "startdate", "acqfromdt"])),
      periodTo: dateOrUndefined(get(["todate", "to", "enddate", "acqtodt"])),
      disclosureDate: toIsoDate(
        asString(get(["broadcastdate", "date", "intimdate", "disclosuredate", "broadcastdt", "announceddate"])),
      ),
      source: asString(get(["source", "src", "datasource"])).trim() || "Munshot",
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
