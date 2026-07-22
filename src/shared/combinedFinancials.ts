// Pure parser for the Munshot `combined_financials` endpoint.
//
// The upstream returns a Markdown document (a Screener-style company page):
//
//   # Financial Summary for RELIANCE
//   ## Pros & Cons
//   ### Cons
//   - ...
//   ## About
//   Reliance was founded by ...
//   ## Stock details
//   - **Market Cap**: ₹ 18,00,089 Cr.
//   ## Balance Sheet
//   |  | Mar 2015 | ... |
//   ## Profit & Loss
//   ## Quarterly Results
//   ## Peer Comparison
//
// Everything here is PURE and NEVER throws — a missing or malformed section just
// yields an empty/undefined value, so odd companies degrade cleanly instead of
// breaking the card. Shared by BOTH the Worker (to build the API response) and,
// in tests, directly.

import type {
  FinancialMetric,
  FinancialsRow,
  FinancialsTable,
} from "./types";

export interface ParsedCombinedFinancials {
  companyName: string;
  about: string;
  pros: string[];
  cons: string[];
  metrics: FinancialMetric[];
  profitAndLoss?: FinancialsTable;
  balanceSheet?: FinancialsTable;
  quarterly?: FinancialsTable;
  peers?: FinancialsTable;
}

/**
 * Coerce whatever the upstream returned (raw response text) into a Markdown
 * string. Handles: a raw Markdown body, a bare JSON string, or a JSON object
 * carrying the Markdown under a common field. Returns "" when nothing usable.
 */
export function coerceMarkdown(text: string): string {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "";

  // Only attempt JSON if it looks like JSON — otherwise it's raw Markdown.
  const first = trimmed[0];
  if (first === "{" || first === "[" || first === '"') {
    try {
      const parsed = JSON.parse(trimmed);
      return markdownFromJson(parsed);
    } catch {
      // Not valid JSON after all — fall through and treat as Markdown.
    }
  }
  return trimmed;
}

function markdownFromJson(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const fields = [
      "markdown",
      "result",
      "content",
      "text",
      "data",
      "output",
      "summary",
      "message",
      "response",
      "report",
    ];
    for (const f of fields) {
      const v = obj[f];
      if (typeof v === "string" && v.trim()) return v.trim();
      // One level of nesting (e.g. { data: { markdown } } or { data: "..." }).
      if (v && typeof v === "object") {
        const nested = markdownFromJson(v);
        if (nested) return nested;
      }
    }
  }
  return "";
}

/** Parse a `combined_financials` Markdown document into a structured shape. */
export function parseCombinedFinancials(markdown: string): ParsedCombinedFinancials {
  const { title, sections } = splitSections(markdown ?? "");

  const companyName = (title ?? "")
    .replace(/^financial summary for\s+/i, "")
    .trim();

  const metrics = parseKeyValueBullets(findSection(sections, "stock detail"));
  const { pros, cons } = parseProsCons(findSection(sections, "pros"));
  const about = joinParagraph(findSection(sections, "about"));
  const profitAndLoss = parseTable(findSection(sections, "profit"));
  const balanceSheet = parseTable(findSection(sections, "balance"));
  const quarterly = parseTable(findSection(sections, "quarter"));
  const peers = parseTable(findSection(sections, "peer"));

  return { companyName, about, pros, cons, metrics, profitAndLoss, balanceSheet, quarterly, peers };
}

/** True when the parse produced any usable content (else the route reports not_found). */
export function hasFinancialsContent(p: ParsedCombinedFinancials): boolean {
  return (
    p.metrics.length > 0 ||
    p.pros.length > 0 ||
    p.cons.length > 0 ||
    p.about.length > 0 ||
    !!p.profitAndLoss ||
    !!p.balanceSheet ||
    !!p.quarterly ||
    !!p.peers
  );
}

// ---------------------------------------------------------------------------
// Section splitting
// ---------------------------------------------------------------------------

interface SplitResult {
  title?: string;
  sections: Map<string, string[]>; // lowercased h2 heading -> body lines
}

function splitSections(md: string): SplitResult {
  const lines = md.split(/\r?\n/);
  const sections = new Map<string, string[]>();
  let title: string | undefined;
  let current: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (current !== null) sections.set(current.toLowerCase(), buf);
    buf = [];
  };

  for (const line of lines) {
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      flush();
      current = h2[1].trim();
      continue;
    }
    const h1 = /^#\s+(.*)$/.exec(line);
    if (h1) {
      if (current === null && title === undefined) title = h1[1].trim();
      continue;
    }
    if (current !== null) buf.push(line);
  }
  flush();

  return { title, sections };
}

/** Return the body of the first section whose heading contains any of `keys`. */
function findSection(sections: Map<string, string[]>, ...keys: string[]): string[] {
  for (const [heading, body] of sections) {
    if (keys.some((k) => heading.includes(k))) return body;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Block parsers
// ---------------------------------------------------------------------------

/** "- **Market Cap**: ₹ 18,00,089 Cr." -> { label: "Market Cap", value: "₹ 18,00,089 Cr." } */
function parseKeyValueBullets(lines: string[]): FinancialMetric[] {
  const out: FinancialMetric[] = [];
  for (const line of lines) {
    const m = /^\s*[-*]\s+\*\*(.+?)\*\*\s*:?\s*(.*)$/.exec(line);
    if (m) {
      const label = m[1].trim();
      const value = m[2].trim();
      if (label) out.push({ label, value });
    }
  }
  return out;
}

/** Split a "Pros & Cons" block by its "### Pros" / "### Cons" sub-headings. */
function parseProsCons(lines: string[]): { pros: string[]; cons: string[] } {
  const pros: string[] = [];
  const cons: string[] = [];
  let mode: "pros" | "cons" | null = null;

  for (const line of lines) {
    const h3 = /^###\s+(.*)$/.exec(line);
    if (h3) {
      const t = h3[1].toLowerCase();
      mode = t.includes("pro") ? "pros" : t.includes("con") ? "cons" : null;
      continue;
    }
    const b = /^\s*[-*]\s+(.*)$/.exec(line);
    if (b && mode) {
      const text = b[1].trim();
      if (text) (mode === "pros" ? pros : cons).push(text);
    }
  }
  return { pros, cons };
}

/** Collapse a block of lines into a single trimmed paragraph. */
function joinParagraph(lines: string[]): string {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** Parse a GitHub-flavored Markdown table into columns + labeled rows. */
function parseTable(lines: string[]): FinancialsTable | undefined {
  const tableLines = lines.filter((l) => l.trim().startsWith("|"));
  if (tableLines.length < 2) return undefined;

  const header = splitCells(tableLines[0]);
  if (header.length < 2) return undefined;

  // A second row of only dashes/colons/pipes is the header separator — skip it.
  let dataStart = 1;
  if (tableLines[1] && /^[\s|:-]+$/.test(tableLines[1]) && tableLines[1].includes("-")) {
    dataStart = 2;
  }

  const columns = header.slice(1); // first header cell labels the row column
  const rows: FinancialsRow[] = [];

  for (let i = dataStart; i < tableLines.length; i++) {
    const cells = splitCells(tableLines[i]);
    if (cells.length === 0 || cells.every((c) => c === "")) continue;
    const label = cells[0] ?? "";
    const rest = cells.slice(1);
    // Normalize row width to the column count (pad short, drop overflow).
    const norm =
      rest.length === columns.length
        ? rest
        : columns.map((_, idx) => rest[idx] ?? "");
    rows.push({ label, cells: norm });
  }

  if (rows.length === 0) return undefined;
  return { columns, rows };
}

/** Split a Markdown table row into trimmed cell values (drops the outer pipes). */
function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}
