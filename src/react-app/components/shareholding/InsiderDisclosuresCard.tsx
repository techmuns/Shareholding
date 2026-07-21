// "Insider Trading Disclosures" card — SEBI PIT Reg 7(2) disclosures (NSE primary,
// BSE fallback) for the last ~12 months, as a sortable detail table.
import { useMemo } from "react";
import { ArrowDown, ArrowUp, Inbox } from "lucide-react";
import type { InsiderTrade, InsiderTxnType } from "@shared/types";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { InsiderStateGate, SourceLine, type InsiderState } from "./common";
import { useDashboardData } from "@/state/dashboard-data";

const TYPE_STYLE: Record<InsiderTxnType, { label: string; color: string; bg: string }> = {
  buy: { label: "BUY", color: "#059669", bg: "#ecfdf5" },
  sell: { label: "SELL", color: "#dc2626", bg: "#fef2f2" },
  pledge: { label: "PLEDGE", color: "#d97706", bg: "#fffbeb" },
  revoke: { label: "REVOKE", color: "#4338ca", bg: "#eef2ff" },
  other: { label: "OTHER", color: "#6b7280", bg: "#f3f4f6" },
};

const fmtQty = (n: number) => n.toLocaleString("en-IN");

function fmtValue(n: number | undefined): string {
  if (n === undefined || n <= 0) return "—";
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function Chip({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 700,
        color,
        background: bg,
        border: `1px solid ${color}33`,
        borderRadius: 6,
        padding: "1px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

type SortKey = "date" | "quantity";

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid rgba(229,231,235,0.9)",
        borderRadius: 10,
        background: "#ffffff",
        padding: "8px 14px",
        minWidth: 120,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function DisclosuresTable({ trades }: { trades: InsiderTrade[] }) {
  // Sort state lives in the shared store so the snapshot handler can report it.
  const { insiderSort, setInsiderSort } = useDashboardData();
  const sortKey = insiderSort.key;
  const desc = insiderSort.desc;

  const rows = useMemo(() => {
    const copy = [...trades];
    copy.sort((a, b) => {
      let cmp: number;
      if (sortKey === "quantity") cmp = a.quantity - b.quantity;
      else cmp = Date.parse(a.disclosureDate || "") - Date.parse(b.disclosureDate || "");
      if (Number.isNaN(cmp)) cmp = 0;
      return desc ? -cmp : cmp;
    });
    return copy;
  }, [trades, sortKey, desc]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) setInsiderSort({ key, desc: !desc });
    else setInsiderSort({ key, desc: true });
  };

  const th: React.CSSProperties = {
    position: "sticky",
    top: 0,
    background: "rgba(249,250,251,0.98)",
    backdropFilter: "blur(4px)",
    textAlign: "right",
    fontSize: 11,
    fontWeight: 600,
    color: "#6b7280",
    padding: "8px 12px",
    borderBottom: "1px solid rgba(229,231,235,0.9)",
    whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    textAlign: "right",
    fontSize: 12,
    color: "#374151",
    padding: "8px 12px",
    borderBottom: "1px solid rgba(229,231,235,0.6)",
    whiteSpace: "nowrap",
  };
  const sortBtn = (key: SortKey, label: string, align: "left" | "right") => (
    <button
      type="button"
      className="th-sort"
      onClick={() => toggle(key)}
      title={`Sort by ${label.toLowerCase()}`}
      style={{
        color: sortKey === key ? "#4338ca" : "#6b7280",
        marginLeft: align === "right" ? "auto" : undefined,
      }}
    >
      {label}
      {sortKey === key && (desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
    </button>
  );
  const ariaSort = (key: SortKey): "ascending" | "descending" | undefined =>
    sortKey === key ? (desc ? "descending" : "ascending") : undefined;

  return (
    <div style={{ maxHeight: 360, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th scope="col" style={{ ...th, textAlign: "left" }} aria-sort={ariaSort("date")}>
              {sortBtn("date", "Date", "left")}
            </th>
            <th scope="col" style={{ ...th, textAlign: "left", width: "22%" }}>
              Person
            </th>
            <th scope="col" style={{ ...th, textAlign: "left" }}>
              Category
            </th>
            <th scope="col" style={{ ...th, textAlign: "left" }}>
              Type
            </th>
            <th scope="col" style={th} aria-sort={ariaSort("quantity")}>
              {sortBtn("quantity", "Quantity", "right")}
            </th>
            <th scope="col" style={th}>
              Value
            </th>
            <th scope="col" style={th}>
              Holding After
            </th>
            <th scope="col" style={{ ...th, textAlign: "left" }}>
              Mode
            </th>
            <th scope="col" style={{ ...th, textAlign: "left" }}>
              Source
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => {
            const ts = TYPE_STYLE[t.transactionType];
            return (
              <tr key={`${t.personName}-${t.disclosureDate}-${i}`}>
                <td style={{ ...td, textAlign: "left" }}>{fmtDate(t.disclosureDate)}</td>
                <td
                  style={{
                    ...td,
                    textAlign: "left",
                    fontWeight: 600,
                    color: "#111827",
                    whiteSpace: "normal",
                  }}
                >
                  {t.personName || "—"}
                </td>
                <td style={{ ...td, textAlign: "left", color: "#6b7280" }}>
                  {t.personCategory ?? "—"}
                </td>
                <td style={{ ...td, textAlign: "left" }}>
                  <Chip color={ts.color} bg={ts.bg} label={ts.label} />
                </td>
                <td style={{ ...td, fontWeight: 600, color: "#111827" }}>{fmtQty(t.quantity)}</td>
                <td style={td}>{fmtValue(t.value)}</td>
                <td style={td}>
                  {t.sharesAfterPct === undefined ? "—" : `${t.sharesAfterPct.toFixed(2)}%`}
                </td>
                <td style={{ ...td, textAlign: "left", color: "#6b7280" }}>{t.mode ?? "—"}</td>
                <td style={{ ...td, textAlign: "left" }}>
                  <Chip color="#6b7280" bg="#f3f4f6" label={t.source} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function InsiderDisclosuresCard({ state }: { state: InsiderState }) {
  return (
    <WidgetCard
      title="Insider Trading Disclosures"
      subtitle="SEBI PIT Reg 7(2) · last 12 months"
      wide
    >
      <InsiderStateGate state={state} loadingRows={6}>
        {(insider) => {
          const { trades } = insider;
          const buys = trades.filter((t) => t.transactionType === "buy").length;
          const sells = trades.filter((t) => t.transactionType === "sell").length;
          const sourceLabel =
            insider.sources.length > 0
              ? insider.sources.join(" · ")
              : "NSE · BSE (none returned)";

          return (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {trades.length === 0 ? (
                <div
                  style={{
                    minHeight: 160,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    gap: 8,
                    padding: 24,
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      background: "#eef2ff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#4f46e5",
                    }}
                  >
                    <Inbox size={20} />
                  </div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#374151" }}>
                    No insider trading disclosures reported for this company in the last 12 months.
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>
                    This is common and normal — many companies report none in a given window.
                  </p>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "12px 16px" }}>
                    <Kpi label="Disclosures" value={String(trades.length)} />
                    <Kpi label="Buy filings" value={String(buys)} />
                    <Kpi label="Sell filings" value={String(sells)} />
                  </div>
                  <DisclosuresTable trades={trades} />
                </>
              )}

              <SourceLine
                source={sourceLabel}
                context={`Window ${insider.windowFrom} – ${insider.windowTo}`}
                asOf={insider.asOf}
                note={insider.note}
              />
            </div>
          );
        }}
      </InsiderStateGate>
    </WidgetCard>
  );
}
