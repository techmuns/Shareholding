// Excel (.xlsx) export — a multi-sheet workbook with one sheet per loaded card.
// Uses the dependency-free writer in ./xlsx (no third-party library).
import type {
  HoldersSuccess,
  InsiderSuccess,
  SelectedCompany,
  ShareholdingHistorySuccess,
  ShareholdingPatternSuccess,
} from "@shared/types";
import { publicFloatPct } from "@shared/bseShareholding";
import { buildXlsxBlob, downloadBlob, type CellValue, type Sheet } from "./xlsx";

export interface DashboardExportInput {
  company: SelectedCompany;
  generatedAt: string; // ISO
  pattern?: ShareholdingPatternSuccess;
  holders?: HoldersSuccess;
  insider?: InsiderSuccess;
  history?: ShareholdingHistorySuccess;
}

/**
 * Build the workbook sheets for the current company. An "Overview" sheet with
 * the stamp is always present; every other sheet is added only when its card
 * loaded, so the file mirrors exactly what the user is looking at.
 */
export function buildDashboardSheets(input: DashboardExportInput): Sheet[] {
  const { company, generatedAt, pattern, holders, insider, history } = input;
  const sheets: Sheet[] = [];

  // ---- Overview (stamp) --------------------------------------------------
  const scrip = pattern?.scripCode ?? holders?.scripCode ?? insider?.scripCode ?? "";
  const overview: CellValue[][] = [
    ["Shareholding Dashboard Export"],
    ["Company", company.name || company.ticker],
    ["Ticker", company.ticker],
  ];
  if (scrip) overview.push(["BSE Scrip Code", scrip]);
  overview.push(["Generated At", generatedAt]);
  sheets.push({ name: "Overview", rows: overview });

  // ---- Shareholding Summary (latest quarter) ----------------------------
  if (pattern) {
    const b = pattern.latest.breakdown;
    sheets.push({
      name: "Summary",
      rows: [
        ["Shareholding Summary"],
        ["As of quarter", pattern.latest.qtrLabel],
        [],
        ["Category", "Percent of total"],
        ["Promoter & Promoter Group", b.promoterPct],
        ["Public - Institutions (FII + DII)", b.publicInstitutionsPct],
        ["FII / FPI", b.fiiPct],
        ["DII", b.diiPct],
        ["Public - Non-Institutions", b.publicNonInstitutionsPct],
        ["Others (Govt / Custodian / Trusts)", b.othersPct],
        ["Public float (FII + DII + Non-Inst.)", publicFloatPct(b)],
      ],
    });
  }

  // ---- Quarterly Trend ---------------------------------------------------
  if (pattern && pattern.trend.length > 0) {
    const rows: CellValue[][] = [
      ["Quarterly Trend"],
      [],
      ["Quarter", "Promoter %", "FII/FPI %", "DII %", "Public-NonInst %", "Others %"],
    ];
    for (const q of pattern.trend) {
      const b = q.breakdown;
      rows.push([
        q.qtrLabel,
        b.promoterPct,
        b.fiiPct,
        b.diiPct,
        b.publicNonInstitutionsPct,
        b.othersPct,
      ]);
    }
    sheets.push({ name: "Trend", rows });
  }

  // ---- Individual Holders (by category) ---------------------------------
  if (holders) {
    const rows: CellValue[][] = [
      ["Individual Holders"],
      ["As of quarter", holders.qtrLabel],
      [],
      ["Category", "Holder", "Percent", "Shares", "Pledged %"],
    ];
    const groups: [string, HoldersSuccess["promoters"]][] = [
      ["Promoter", holders.promoters],
      ["FII / FPI", holders.fii],
      ["DII", holders.dii],
      ["Other Public", holders.publicOther],
    ];
    for (const [label, list] of groups) {
      for (const h of list) {
        rows.push([label, h.name, h.pct, h.sharesHeld, h.pledgedPct ?? ""]);
      }
    }
    sheets.push({ name: "Holders", rows });
  }

  // ---- Insider Disclosures ----------------------------------------------
  if (insider) {
    const rows: CellValue[][] = [
      ["Insider Trading Disclosures (SEBI PIT)"],
      ["Window", `${insider.windowFrom} to ${insider.windowTo}`],
      ["Feeds returning data", insider.sources.join(" + ") || "none"],
      [],
      [
        "Disclosure Date",
        "Person",
        "Category",
        "Type",
        "Quantity",
        "Value (INR)",
        "Holding After %",
        "Mode",
        "Source",
      ],
    ];
    for (const t of insider.trades) {
      rows.push([
        t.disclosureDate,
        t.personName,
        t.personCategory ?? "",
        t.transactionType,
        t.quantity,
        t.value ?? "",
        t.sharesAfterPct ?? "",
        t.mode ?? "",
        t.source,
      ]);
    }
    sheets.push({ name: "Insider", rows });
  }

  // ---- Shareholding Pattern (history, via Munshot) ----------------------
  if (history && history.groups.length > 0) {
    const rows: CellValue[][] = [
      ["Shareholding Pattern History (Munshot)"],
      [],
      ["Holder / Category", ...history.quarters],
    ];
    for (const g of history.groups) {
      rows.push([g.category, ...history.quarters.map((_, i) => g.subtotal[i] ?? "")]);
      for (const h of g.holders) {
        rows.push([`  ${h.label}`, ...history.quarters.map((_, i) => h.cells[i] ?? "")]);
      }
    }
    if (history.shareholders) {
      const sh = history.shareholders;
      rows.push([sh.label, ...history.quarters.map((_, i) => sh.cells[i] ?? "")]);
    }
    sheets.push({ name: "Pattern History", rows });
  }

  return sheets;
}

/** Build the workbook and trigger a client-side .xlsx download. */
export function exportDashboardXlsx(input: DashboardExportInput): void {
  const sheets = buildDashboardSheets(input);
  const blob = buildXlsxBlob(sheets);
  downloadBlob(exportFilename(input.company, input.generatedAt), blob);
}

/** A safe, dated filename for the current company's export. */
export function exportFilename(company: SelectedCompany, generatedAt: string): string {
  const safe = (company.ticker || company.name || "company").replace(/[^A-Za-z0-9_-]+/g, "_");
  const date = generatedAt.slice(0, 10);
  return `shareholding_${safe}_${date}.xlsx`;
}
