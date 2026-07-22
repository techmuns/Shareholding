// CSV export — a single, self-explanatory .csv with clearly-labeled sections.
// No new dependencies; proper RFC-4180-style escaping.
import type {
  CombinedFinancialsSuccess,
  FinancialsTable,
  HoldersSuccess,
  InsiderSuccess,
  SelectedCompany,
  ShareholdingPatternSuccess,
} from "@shared/types";
import { publicFloatPct } from "@shared/bseShareholding";

/** Escape a single CSV field (quote when it contains comma / quote / newline). */
function esc(value: unknown): string {
  const s =
    value === null || value === undefined
      ? ""
      : typeof value === "number"
        ? String(value)
        : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(...cells: unknown[]): string {
  return cells.map(esc).join(",");
}

export interface DashboardExportInput {
  company: SelectedCompany;
  generatedAt: string; // ISO
  pattern?: ShareholdingPatternSuccess;
  holders?: HoldersSuccess;
  insider?: InsiderSuccess;
  financials?: CombinedFinancialsSuccess;
}

/** Emit a labeled financial-statement table as CSV rows (header + data rows). */
function pushTable(lines: string[], heading: string, table: FinancialsTable | undefined): void {
  if (!table || table.rows.length === 0) return;
  lines.push(row(`## ${heading}`));
  lines.push(row("", ...table.columns));
  for (const r of table.rows) {
    lines.push(row(r.label, ...table.columns.map((_, i) => r.cells[i] ?? "")));
  }
  lines.push("");
}

/**
 * Build a single CSV document with a stamped header and one labeled section per
 * loaded card. Sections that didn't load are simply omitted.
 */
export function buildDashboardCsv(input: DashboardExportInput): string {
  const { company, generatedAt, pattern, holders, insider, financials } = input;
  const lines: string[] = [];

  // ---- Stamp -------------------------------------------------------------
  lines.push(row("Shareholding Dashboard Export"));
  lines.push(row("Company", company.name || company.ticker));
  lines.push(row("Ticker", company.ticker));
  const scrip = pattern?.scripCode ?? holders?.scripCode ?? insider?.scripCode ?? "";
  if (scrip) lines.push(row("BSE Scrip Code", scrip));
  lines.push(row("Generated At", generatedAt));
  lines.push("");

  // ---- Shareholding Summary (latest quarter) ----------------------------
  if (pattern) {
    const b = pattern.latest.breakdown;
    lines.push(row("## Shareholding Summary"));
    lines.push(row("As of quarter", pattern.latest.qtrLabel));
    lines.push(row("Category", "Percent of total"));
    lines.push(row("Promoter & Promoter Group", b.promoterPct));
    lines.push(row("Public - Institutions (FII + DII)", b.publicInstitutionsPct));
    lines.push(row("FII / FPI", b.fiiPct));
    lines.push(row("DII", b.diiPct));
    lines.push(row("Public - Non-Institutions", b.publicNonInstitutionsPct));
    lines.push(row("Others (Govt / Custodian / Trusts)", b.othersPct));
    lines.push(row("Public float (FII + DII + Non-Inst.)", publicFloatPct(b)));
    lines.push("");
  }

  // ---- Quarterly Trend ---------------------------------------------------
  if (pattern && pattern.trend.length > 0) {
    lines.push(row("## Quarterly Trend"));
    lines.push(
      row("Quarter", "Promoter %", "FII/FPI %", "DII %", "Public-NonInst %", "Others %"),
    );
    for (const q of pattern.trend) {
      const b = q.breakdown;
      lines.push(
        row(
          q.qtrLabel,
          b.promoterPct,
          b.fiiPct,
          b.diiPct,
          b.publicNonInstitutionsPct,
          b.othersPct,
        ),
      );
    }
    lines.push("");
  }

  // ---- Individual Holders (by category) ---------------------------------
  if (holders) {
    lines.push(row("## Individual Holders"));
    lines.push(row("As of quarter", holders.qtrLabel));
    lines.push(row("Category", "Holder", "Percent", "Shares", "Pledged %"));
    const groups: [string, HoldersSuccess["promoters"]][] = [
      ["Promoter", holders.promoters],
      ["FII / FPI", holders.fii],
      ["DII", holders.dii],
      ["Other Public", holders.publicOther],
    ];
    for (const [label, list] of groups) {
      for (const h of list) {
        lines.push(
          row(label, h.name, h.pct, h.sharesHeld, h.pledgedPct === undefined ? "" : h.pledgedPct),
        );
      }
    }
    lines.push("");
  }

  // ---- Insider Disclosures ----------------------------------------------
  if (insider) {
    lines.push(row("## Insider Trading Disclosures (SEBI PIT Reg 7(2))"));
    lines.push(row("Window", `${insider.windowFrom} to ${insider.windowTo}`));
    lines.push(row("Feeds returning data", insider.sources.join(" + ") || "none"));
    lines.push(
      row(
        "Disclosure Date",
        "Person",
        "Category",
        "Type",
        "Quantity",
        "Value (INR)",
        "Holding After %",
        "Mode",
        "Source",
      ),
    );
    for (const t of insider.trades) {
      lines.push(
        row(
          t.disclosureDate,
          t.personName,
          t.personCategory ?? "",
          t.transactionType,
          t.quantity,
          t.value ?? "",
          t.sharesAfterPct ?? "",
          t.mode ?? "",
          t.source,
        ),
      );
    }
    lines.push("");
  }

  // ---- Fundamentals & financial statements ------------------------------
  if (financials) {
    if (financials.metrics.length > 0) {
      lines.push(row("## Key Metrics"));
      lines.push(row("Metric", "Value"));
      for (const m of financials.metrics) lines.push(row(m.label, m.value));
      lines.push("");
    }
    if (financials.pros.length > 0 || financials.cons.length > 0) {
      lines.push(row("## Highlights"));
      for (const p of financials.pros) lines.push(row("Pro", p));
      for (const cn of financials.cons) lines.push(row("Con", cn));
      lines.push("");
    }
    if (financials.about) {
      lines.push(row("## About"));
      lines.push(row(financials.about));
      lines.push("");
    }
    pushTable(lines, "Profit & Loss", financials.profitAndLoss);
    pushTable(lines, "Balance Sheet", financials.balanceSheet);
    pushTable(lines, "Quarterly Results", financials.quarterly);
    pushTable(lines, "Peer Comparison", financials.peers);
  }

  return lines.join("\r\n");
}

/** Trigger a client-side download of `csv` as `filename`. */
export function downloadCsv(filename: string, csv: string): void {
  // Prepend a BOM (U+FEFF) so Excel reads UTF-8 correctly.
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** A safe, dated filename for the current company's export. */
export function exportFilename(company: SelectedCompany, generatedAt: string): string {
  const safe = (company.ticker || company.name || "company").replace(/[^A-Za-z0-9_-]+/g, "_");
  const date = generatedAt.slice(0, 10);
  return `shareholding_${safe}_${date}.csv`;
}
