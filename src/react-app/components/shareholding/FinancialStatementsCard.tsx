// "Financial Statements" card — tabbed P&L / Balance Sheet / Quarterly / Peers
// tables from the Munshot combined-financials feed. Each table is period-wide, so
// the label column is sticky and the period columns scroll horizontally.
import { useMemo, useState } from "react";
import type { CombinedFinancialsSuccess, FinancialsTable } from "@shared/types";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { FinancialsStateGate, SourceLine, type FinancialsState } from "./common";

type TabKey = "pl" | "bs" | "q" | "peers";

interface Tab {
  key: TabKey;
  label: string;
  table?: FinancialsTable;
}

// Rows worth emphasizing in the statements (matched after stripping a trailing "+").
const EMPHASIZE = new Set(
  [
    "sales",
    "operating profit",
    "net profit",
    "profit before tax",
    "total assets",
    "total liabilities",
    "total revenue",
  ].map((s) => s.toLowerCase()),
);

const normLabel = (label: string) => label.replace(/\s*\+\s*$/, "").trim().toLowerCase();

function StatementTable({ table }: { table: FinancialsTable }) {
  const th: React.CSSProperties = {
    position: "sticky",
    top: 0,
    background: "rgba(249,250,251,0.98)",
    backdropFilter: "blur(4px)",
    fontSize: 11,
    fontWeight: 600,
    color: "#6b7280",
    padding: "8px 12px",
    borderBottom: "1px solid rgba(229,231,235,0.9)",
    whiteSpace: "nowrap",
    textAlign: "right",
  };
  const labelTh: React.CSSProperties = {
    ...th,
    left: 0,
    zIndex: 2,
    textAlign: "left",
    background: "rgba(249,250,251,0.99)",
  };
  const td: React.CSSProperties = {
    padding: "8px 12px",
    borderBottom: "1px solid rgba(229,231,235,0.5)",
    whiteSpace: "nowrap",
    textAlign: "right",
    fontSize: 12,
    color: "#374151",
    fontVariantNumeric: "tabular-nums",
  };

  return (
    <div style={{ maxHeight: 420, overflow: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th scope="col" style={labelTh} />
            {table.columns.map((c, i) => (
              <th key={i} scope="col" style={th}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, ri) => {
            const emphasize = EMPHASIZE.has(normLabel(r.label));
            return (
              <tr key={ri} style={emphasize ? { background: "rgba(238,242,255,0.4)" } : undefined}>
                <th
                  scope="row"
                  style={{
                    ...td,
                    position: "sticky",
                    left: 0,
                    zIndex: 1,
                    textAlign: "left",
                    fontWeight: emphasize ? 700 : 500,
                    color: emphasize ? "#111827" : "#4b5563",
                    background: emphasize ? "rgba(238,242,255,0.75)" : "#ffffff",
                  }}
                >
                  {r.label || "—"}
                </th>
                {table.columns.map((_, ci) => (
                  <td
                    key={ci}
                    style={{
                      ...td,
                      fontWeight: emphasize ? 700 : 400,
                      color: emphasize ? "#111827" : "#374151",
                    }}
                  >
                    {r.cells[ci] || ""}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FinancialStatementsCard({ state }: { state: FinancialsState }) {
  return (
    <WidgetCard
      title="Financial Statements"
      subtitle="Profit & loss, balance sheet, quarterly results & peers · via Munshot"
      className="span-12"
    >
      <FinancialsStateGate state={state} loadingRows={8}>
        {(f) => <StatementsBody financials={f} />}
      </FinancialsStateGate>
    </WidgetCard>
  );
}

function StatementsBody({ financials: f }: { financials: CombinedFinancialsSuccess }) {
  const tabs = useMemo<Tab[]>(
    () =>
      (
        [
          { key: "pl", label: "Profit & Loss", table: f.profitAndLoss },
          { key: "bs", label: "Balance Sheet", table: f.balanceSheet },
          { key: "q", label: "Quarterly", table: f.quarterly },
          { key: "peers", label: "Peers", table: f.peers },
        ] as Tab[]
      ).filter((t) => t.table && t.table.rows.length > 0),
    [f],
  );

  const [active, setActive] = useState<TabKey>(tabs[0]?.key ?? "pl");
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  if (tabs.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
        No financial statements available for this company.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "10px 12px",
          borderBottom: "1px solid rgba(229,231,235,0.7)",
          flexWrap: "wrap",
        }}
      >
        {tabs.map((t) => {
          const on = t.key === current.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              style={{
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                color: on ? "#4338ca" : "#6b7280",
                background: on ? "#eef2ff" : "transparent",
                border: `1px solid ${on ? "#e0e7ff" : "transparent"}`,
                borderRadius: 8,
                padding: "4px 12px",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {current.table && <StatementTable table={current.table} />}

      <div style={{ flex: 1 }} />
      <div style={{ padding: "8px 14px 0", fontSize: 11, color: "#9ca3af" }}>
        Figures in ₹ Cr. unless a unit is shown; consolidated statements where available.
      </div>
      <SourceLine
        source={f.source}
        context={`${f.basis} · ${f.period}`}
        asOf={f.asOf}
        note={f.note}
      />
    </div>
  );
}
