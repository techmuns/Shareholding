// Pure parser for the Munshot `combined_financials` endpoint.
//
// The upstream returns a Markdown company page (a Screener-style report). This is
// a SHAREHOLDING dashboard, so we extract ONLY the "## Shareholding Pattern"
// section — a wide table of category subtotals and the named entities under each,
// across the recent quarters:
//
//   ## Shareholding Pattern
//   |  | Sep 2023 | Dec 2023 | ... |
//   | --- | --- | --- | ... |
//   | Promoters - | 50.27% | 50.30% | ... |   <- category subtotal
//   | Srichakra Commercials LLP | 11.19 | 11.20 | ... |   <- named holder
//   | FIIs - | 22.60% | ... |
//   | DIIs - | 15.99% | ... |
//   | Government - | 0.17% | ... |
//   | Public - | 10.98% | ... |
//   | No. of Shareholders | 36,98,648 | ... |
//
// Everything here is PURE and NEVER throws — a missing or malformed section just
// yields empty quarters/groups, so odd companies degrade cleanly.

import type {
  ShareholdingHistoryGroup,
  ShareholdingHistoryRow,
} from "./types";

export interface ParsedShareholdingHistory {
  companyName: string;
  quarters: string[];
  groups: ShareholdingHistoryGroup[];
  shareholders?: ShareholdingHistoryRow;
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

/** Parse a `combined_financials` Markdown document's shareholding pattern. */
export function parseShareholdingHistory(markdown: string): ParsedShareholdingHistory {
  const { title, sections } = splitSections(markdown ?? "");

  const companyName = (title ?? "")
    .replace(/^financial summary for\s+/i, "")
    .trim();

  const { columns, rows } = parseTable(findSection(sections, "shareholding pattern"));
  const groups: ShareholdingHistoryGroup[] = [];
  let shareholders: ShareholdingHistoryRow | undefined;
  let current: ShareholdingHistoryGroup | undefined;

  for (const r of rows) {
    if (isShareholderCountRow(r.label)) {
      shareholders = r;
      continue;
    }
    if (isCategoryRow(r.label)) {
      current = { category: cleanCategory(r.label), subtotal: r.cells, holders: [] };
      groups.push(current);
      continue;
    }
    // A named holder belongs to the most recent category header seen.
    if (current) current.holders.push(r);
  }

  return { companyName, quarters: columns, groups, shareholders };
}

/** True when the parse produced a usable shareholding pattern. */
export function hasShareholdingContent(p: ParsedShareholdingHistory): boolean {
  return p.quarters.length > 0 && p.groups.length > 0;
}

// A category subtotal row ends with a dash ("Promoters -", "FIIs -", ...), or is
// one of the known category names.
const KNOWN_CATEGORIES = ["promoter", "fii", "dii", "government", "public"];

function isCategoryRow(label: string): boolean {
  const l = label.trim().toLowerCase();
  if (/-\s*$/.test(label.trim())) return true;
  const bare = l.replace(/[-\s]+$/, "").trim();
  return KNOWN_CATEGORIES.some((k) => bare === k || bare === `${k}s`);
}

function isShareholderCountRow(label: string): boolean {
  return /^no\.?\s*of\s*shareholders/i.test(label.trim());
}

function cleanCategory(label: string): string {
  return label.replace(/-\s*$/, "").trim();
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
// Table parsing
// ---------------------------------------------------------------------------

interface ParsedTable {
  columns: string[];
  rows: ShareholdingHistoryRow[];
}

/** Parse a GitHub-flavored Markdown table into quarter columns + labeled rows. */
function parseTable(lines: string[]): ParsedTable {
  const tableLines = lines.filter((l) => l.trim().startsWith("|"));
  if (tableLines.length < 2) return { columns: [], rows: [] };

  const header = splitCells(tableLines[0]);
  if (header.length < 2) return { columns: [], rows: [] };

  // A second row of only dashes/colons/pipes is the header separator — skip it.
  let dataStart = 1;
  if (tableLines[1] && /^[\s|:-]+$/.test(tableLines[1]) && tableLines[1].includes("-")) {
    dataStart = 2;
  }

  const columns = header.slice(1); // first header cell labels the row column
  const rows: ShareholdingHistoryRow[] = [];

  for (let i = dataStart; i < tableLines.length; i++) {
    const cells = splitCells(tableLines[i]);
    if (cells.length === 0 || cells.every((c) => c === "")) continue;
    const label = cells[0] ?? "";
    const rest = cells.slice(1);
    // Normalize row width to the column count (pad short, drop overflow).
    const norm =
      rest.length === columns.length ? rest : columns.map((_, idx) => rest[idx] ?? "");
    rows.push({ label, cells: norm });
  }

  return { columns, rows };
}

/** Split a Markdown table row into trimmed cell values (drops the outer pipes). */
function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}
