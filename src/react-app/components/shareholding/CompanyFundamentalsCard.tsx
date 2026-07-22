// "Company Fundamentals" card — key stock metrics, analyst pros/cons highlights,
// and the company profile, from the Munshot combined-financials feed.
import { CheckCircle2, TriangleAlert } from "lucide-react";
import type { FinancialMetric } from "@shared/types";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { FinancialsStateGate, SourceLine, type FinancialsState } from "./common";

// Preferred metric order — anything present but not listed still shows, after.
const METRIC_ORDER = [
  "Market Cap",
  "Current Price",
  "Stock P/E",
  "Book Value",
  "Dividend Yield",
  "ROCE",
  "ROE",
  "High / Low",
  "Face Value",
];

function orderMetrics(metrics: FinancialMetric[]): FinancialMetric[] {
  const rank = (label: string) => {
    const i = METRIC_ORDER.findIndex((m) => m.toLowerCase() === label.toLowerCase());
    return i === -1 ? METRIC_ORDER.length : i;
  };
  return [...metrics].sort((a, b) => rank(a.label) - rank(b.label));
}

function MetricTile({ label, value }: FinancialMetric) {
  return (
    <div
      style={{
        border: "1px solid rgba(229,231,235,0.9)",
        borderRadius: 10,
        background: "#ffffff",
        padding: "10px 14px",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "#111827",
          marginTop: 2,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function HighlightList({
  title,
  items,
  color,
  bg,
  icon,
}: {
  title: string;
  items: string[];
  color: string;
  bg: string;
  icon: React.ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color, fontSize: 12, fontWeight: 700 }}>
        {icon}
        {title}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5 }}>
        {items.map((t, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              gap: 7,
              fontSize: 12.5,
              color: "#374151",
              lineHeight: 1.45,
            }}
          >
            <span style={{ color, flexShrink: 0, marginTop: 6, width: 5, height: 5, borderRadius: 5, background: color }} />
            <span style={{ background: bg, borderRadius: 6, padding: "1px 2px" }}>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CompanyFundamentalsCard({ state }: { state: FinancialsState }) {
  return (
    <WidgetCard
      title="Company Fundamentals"
      subtitle="Key metrics, highlights & profile · via Munshot"
      className="span-12"
    >
      <FinancialsStateGate state={state} loadingRows={5}>
        {(f) => {
          const metrics = orderMetrics(f.metrics);
          const hasHighlights = f.pros.length > 0 || f.cons.length > 0;
          return (
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              {metrics.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: 10,
                    padding: "14px 16px",
                  }}
                >
                  {metrics.map((m) => (
                    <MetricTile key={m.label} {...m} />
                  ))}
                </div>
              )}

              {(hasHighlights || f.about) && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: hasHighlights && f.about ? "repeat(auto-fit, minmax(280px, 1fr))" : "1fr",
                    gap: 16,
                    padding: "4px 16px 14px",
                  }}
                >
                  {hasHighlights && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <HighlightList
                        title="Pros"
                        items={f.pros}
                        color="#059669"
                        bg="#ecfdf5"
                        icon={<CheckCircle2 size={14} />}
                      />
                      <HighlightList
                        title="Cons"
                        items={f.cons}
                        color="#d97706"
                        bg="#fffbeb"
                        icon={<TriangleAlert size={14} />}
                      />
                    </div>
                  )}

                  {f.about && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#4338ca" }}>About</div>
                      <p style={{ margin: 0, fontSize: 12.5, color: "#4b5563", lineHeight: 1.55 }}>
                        {f.about}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div style={{ flex: 1 }} />
              <SourceLine
                source={f.source}
                context={`${f.basis} · ${f.period}`}
                asOf={f.asOf}
                note={f.note}
              />
            </div>
          );
        }}
      </FinancialsStateGate>
    </WidgetCard>
  );
}
