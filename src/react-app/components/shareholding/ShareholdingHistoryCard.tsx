// "Shareholding Pattern (History)" card — the multi-quarter shareholding pattern
// from the Munshot combined-financials feed: category subtotals (Promoters /
// FIIs / DIIs / Government / Public) with the named entities disclosed under
// each, across the recent quarters. Complements the BSE-sourced cards with a
// longer, holder-level history.
import { Fragment, useState } from "react";
import type {
  ShareholdingHistoryGroup,
  ShareholdingHistorySuccess,
} from "@shared/types";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { ShareholdingHistoryStateGate, SourceLine, type ShareholdingHistoryCardState } from "./common";

// Category accent colors — aligned with the trend card's series palette.
const CATEGORY_COLOR: Record<string, string> = {
  promoter: "#4f46e5",
  promoters: "#4f46e5",
  fii: "#0d9488",
  fiis: "#0d9488",
  dii: "#d97706",
  diis: "#d97706",
  government: "#7c3aed",
  public: "#6b7280",
};

const accentFor = (category: string): string =>
  CATEGORY_COLOR[category.trim().toLowerCase()] ?? "#6b7280";

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
  zIndex: 3,
  textAlign: "left",
  background: "rgba(249,250,251,0.99)",
};
const td: React.CSSProperties = {
  padding: "7px 12px",
  borderBottom: "1px solid rgba(229,231,235,0.5)",
  whiteSpace: "nowrap",
  textAlign: "right",
  fontSize: 12,
  color: "#374151",
  fontVariantNumeric: "tabular-nums",
};

function CategoryRow({
  group,
  quarters,
  open,
  onToggle,
}: {
  group: ShareholdingHistoryGroup;
  quarters: string[];
  open: boolean;
  onToggle: () => void;
}) {
  const accent = accentFor(group.category);
  const hasHolders = group.holders.length > 0;
  return (
    <tr style={{ background: "rgba(238,242,255,0.4)" }}>
      <th
        scope="row"
        style={{
          ...td,
          position: "sticky",
          left: 0,
          zIndex: 2,
          textAlign: "left",
          fontWeight: 700,
          color: "#111827",
          background: "rgba(238,242,255,0.92)",
          cursor: hasHolders ? "pointer" : "default",
        }}
        onClick={hasHolders ? onToggle : undefined}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: accent, flexShrink: 0 }} />
          {group.category}
          {hasHolders && (
            <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 600 }}>
              {open ? "▾" : "▸"} {group.holders.length}
            </span>
          )}
        </span>
      </th>
      {quarters.map((_, i) => (
        <td key={i} style={{ ...td, fontWeight: 700, color: "#111827", background: "rgba(238,242,255,0.4)" }}>
          {group.subtotal[i] || ""}
        </td>
      ))}
    </tr>
  );
}

function HistoryTable({ history }: { history: ShareholdingHistorySuccess }) {
  const { quarters, groups, shareholders } = history;
  // Categories start expanded; the user can collapse the noisier ones.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (cat: string) => setCollapsed((c) => ({ ...c, [cat]: !c[cat] }));

  return (
    <div style={{ maxHeight: 460, overflow: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th scope="col" style={labelTh}>
              Holder
            </th>
            {quarters.map((q, i) => (
              <th key={i} scope="col" style={th}>
                {q}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const open = !collapsed[g.category];
            return (
              <Fragment key={g.category}>
                <CategoryRow
                  group={g}
                  quarters={quarters}
                  open={open}
                  onToggle={() => toggle(g.category)}
                />
                {open &&
                  g.holders.map((h, hi) => (
                    <tr key={`${g.category}-${hi}`}>
                      <th
                        scope="row"
                        style={{
                          ...td,
                          position: "sticky",
                          left: 0,
                          zIndex: 1,
                          textAlign: "left",
                          fontWeight: 500,
                          color: "#4b5563",
                          background: "#ffffff",
                          paddingLeft: 26,
                          whiteSpace: "normal",
                          minWidth: 200,
                        }}
                      >
                        {h.label || "—"}
                      </th>
                      {quarters.map((_, i) => (
                        <td key={i} style={td}>
                          {h.cells[i] || ""}
                        </td>
                      ))}
                    </tr>
                  ))}
              </Fragment>
            );
          })}
          {shareholders && (
            <tr style={{ background: "rgba(249,250,251,0.9)" }}>
              <th
                scope="row"
                style={{
                  ...td,
                  position: "sticky",
                  left: 0,
                  zIndex: 2,
                  textAlign: "left",
                  fontWeight: 700,
                  color: "#374151",
                  background: "rgba(243,244,246,0.97)",
                  borderTop: "2px solid rgba(229,231,235,0.9)",
                }}
              >
                {shareholders.label}
              </th>
              {quarters.map((_, i) => (
                <td
                  key={i}
                  style={{ ...td, fontWeight: 600, color: "#374151", borderTop: "2px solid rgba(229,231,235,0.9)" }}
                >
                  {shareholders.cells[i] || ""}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ShareholdingHistoryCard({ state }: { state: ShareholdingHistoryCardState }) {
  return (
    <WidgetCard
      title="Shareholding Pattern (History)"
      subtitle="Category subtotals & named holders by quarter · via Munshot"
      className="span-12"
    >
      <ShareholdingHistoryStateGate state={state} loadingRows={8}>
        {(history) =>
          history.groups.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              No shareholding pattern history available for this company.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <HistoryTable history={history} />
              <div style={{ flex: 1 }} />
              <div style={{ padding: "8px 14px 0", fontSize: 11, color: "#9ca3af" }}>
                Figures are % of total shares (No. of Shareholders is a count). Click a category
                to collapse its named holders.
              </div>
              <SourceLine
                source={history.source}
                context={
                  history.quarters.length > 0
                    ? `${history.quarters[0]} – ${history.quarters[history.quarters.length - 1]}`
                    : undefined
                }
                asOf={history.asOf}
                note={history.note}
              />
            </div>
          )
        }
      </ShareholdingHistoryStateGate>
    </WidgetCard>
  );
}
