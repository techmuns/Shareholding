// "Promoter / FII / DII Trend" card — a detailed quarter-by-quarter table of the
// ownership composition, each quarter's QoQ change, and the net change across the
// whole period. (Replaces the earlier stacked-bar chart.)
import type { ShareholdingCategoryBreakdown, ShareholdingQuarter } from "@shared/types";
import { stackRemainderPct } from "@shared/bseShareholding";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { CardStateGate, SourceLine, type PatternState } from "./common";

// Series palette — validated colorblind-safe (matches the summary donut).
const SERIES = [
  { key: "promoter", label: "Promoter", color: "#4f46e5", pick: (b: ShareholdingCategoryBreakdown) => b.promoterPct },
  { key: "fii", label: "FII / FPI", color: "#0d9488", pick: (b: ShareholdingCategoryBreakdown) => b.fiiPct },
  { key: "dii", label: "DII", color: "#d97706", pick: (b: ShareholdingCategoryBreakdown) => b.diiPct },
  { key: "public", label: "Public", color: "#9ca3af", pick: stackRemainderPct },
] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A signed, colored percentage-point change ("+0.35" / "−0.14" / "—"). */
function Delta({ value, showUnit = false }: { value: number | null; showUnit?: boolean }) {
  if (value === null) return <span style={{ color: "#d1d5db" }}>—</span>;
  const v = round2(value);
  const flat = Math.abs(v) < 0.005;
  const up = v > 0;
  const color = flat ? "#9ca3af" : up ? "#059669" : "#dc2626";
  const sign = flat ? "±" : up ? "+" : "−";
  return (
    <span style={{ color, fontWeight: 600 }}>
      {sign}
      {Math.abs(v).toFixed(2)}
      {showUnit ? " pts" : ""}
    </span>
  );
}

const thBase: React.CSSProperties = {
  position: "sticky",
  top: 0,
  background: "rgba(249,250,251,0.98)",
  backdropFilter: "blur(4px)",
  fontSize: 11,
  fontWeight: 600,
  color: "#6b7280",
  padding: "9px 14px",
  borderBottom: "1px solid rgba(229,231,235,0.9)",
  whiteSpace: "nowrap",
};
const tdBase: React.CSSProperties = {
  padding: "9px 14px",
  borderBottom: "1px solid rgba(229,231,235,0.6)",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
};

function ChangeTable({ trend }: { trend: ShareholdingQuarter[] }) {
  const first = trend[0];
  const last = trend[trend.length - 1];

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th scope="col" style={{ ...thBase, textAlign: "left" }}>
              Quarter
            </th>
            {SERIES.map((s) => (
              <th key={s.key} scope="col" style={{ ...thBase, textAlign: "right" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color }} />
                  {s.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trend.map((q, i) => {
            const prev = i > 0 ? trend[i - 1] : undefined;
            return (
              <tr key={q.qtrId}>
                <td style={{ ...tdBase, textAlign: "left", fontWeight: 600, color: "#374151" }}>
                  {q.qtrLabel}
                </td>
                {SERIES.map((s) => {
                  const val = s.pick(q.breakdown);
                  const qoq = prev ? val - s.pick(prev.breakdown) : null;
                  return (
                    <td key={s.key} style={{ ...tdBase, textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                        {val.toFixed(2)}%
                      </div>
                      <div style={{ fontSize: 11, marginTop: 1 }}>
                        <Delta value={qoq} />
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td
              style={{
                ...tdBase,
                textAlign: "left",
                borderTop: "2px solid rgba(229,231,235,0.9)",
                borderBottom: "none",
                background: "rgba(238,242,255,0.55)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: "#4338ca" }}>Net change</div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>
                {first.qtrLabel} → {last.qtrLabel}
              </div>
            </td>
            {SERIES.map((s) => (
              <td
                key={s.key}
                style={{
                  ...tdBase,
                  textAlign: "right",
                  fontSize: 13,
                  borderTop: "2px solid rgba(229,231,235,0.9)",
                  borderBottom: "none",
                  background: "rgba(238,242,255,0.55)",
                }}
              >
                <Delta value={s.pick(last.breakdown) - s.pick(first.breakdown)} showUnit />
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function ShareholdingTrendCard({ state }: { state: PatternState }) {
  return (
    <WidgetCard
      title="Promoter / FII / DII Trend"
      subtitle="Quarter-over-quarter composition & change (BSE)"
      className="span-7"
    >
      <CardStateGate state={state} loadingRows={6}>
        {(pattern) =>
          pattern.trend.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              No quarterly history available yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <ChangeTable trend={pattern.trend} />
              <div style={{ flex: 1 }} />
              <div style={{ padding: "8px 14px 0", fontSize: 11, color: "#9ca3af" }}>
                Figures are % of total capital; QoQ = change vs the previous quarter; all
                changes in percentage points (pts).
              </div>
              <SourceLine
                source="BSE India"
                context={`As of ${pattern.latest.qtrLabel}`}
                asOf={pattern.asOf}
                warn={pattern.partial ? "Some figures may be partial" : undefined}
              />
            </div>
          )
        }
      </CardStateGate>
    </WidgetCard>
  );
}
