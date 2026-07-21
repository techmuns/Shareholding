// "Promoter / FII / DII Trend" card — a lightweight inline-SVG stacked bar chart
// across the quarterly trend series. No chart library.
import type { ShareholdingQuarter } from "@shared/types";
import { quarterAxisParts, stackRemainderPct } from "@shared/bseShareholding";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { CardStateGate, SourceLine, type PatternState } from "./common";

// Calm, distinct, design-token-aligned palette (indigo primary + grayscale-ish).
const SERIES = [
  { key: "promoter", label: "Promoter", color: "#4f46e5" },
  { key: "dii", label: "DII", color: "#d97706" },
  { key: "fii", label: "FII / FPI", color: "#0d9488" },
  { key: "public", label: "Public", color: "#9ca3af" },
] as const;

// Legend order (Promoter / FII / DII / Public) differs from stack order (Promoter
// at the base, Public on top) — both intentional.
const LEGEND_ORDER = ["promoter", "fii", "dii", "public"] as const;

function segmentsFor(q: ShareholdingQuarter): Record<string, number> {
  const b = q.breakdown;
  return {
    promoter: b.promoterPct,
    dii: b.diiPct,
    fii: b.fiiPct,
    public: stackRemainderPct(b), // retail / non-institutional public + other
  };
}

// viewBox geometry (scales responsively to the card width).
const VB_W = 520;
const VB_H = 260;
const PAD = { top: 12, right: 12, bottom: 40, left: 34 };
const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;

function y(pct: number): number {
  return PAD.top + PLOT_H * (1 - pct / 100);
}

function Chart({ trend }: { trend: ShareholdingQuarter[] }) {
  const n = trend.length;
  const slot = PLOT_W / n;
  const barW = Math.min(48, slot * 0.6);
  const colorOf = (key: string) => SERIES.find((s) => s.key === key)?.color ?? "#9ca3af";
  const gridLines = [0, 25, 50, 75, 100];

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width="100%"
      role="img"
      aria-label="Quarterly shareholding composition"
      style={{ display: "block" }}
    >
      {/* gridlines + y labels */}
      {gridLines.map((g) => (
        <g key={g}>
          <line
            x1={PAD.left}
            x2={PAD.left + PLOT_W}
            y1={y(g)}
            y2={y(g)}
            stroke="rgba(229,231,235,0.9)"
            strokeWidth={1}
          />
          <text x={PAD.left - 6} y={y(g) + 3} textAnchor="end" fontSize={9} fill="#9ca3af">
            {g}%
          </text>
        </g>
      ))}

      {/* stacked bars */}
      {trend.map((q, i) => {
        const cx = PAD.left + slot * i + slot / 2;
        const x = cx - barW / 2;
        const segs = segmentsFor(q);
        let cursor = 0; // running % from the bottom
        return (
          <g key={q.qtrId}>
            {(["promoter", "dii", "fii", "public"] as const).map((key) => {
              const val = segs[key];
              if (val <= 0) return null;
              const yTop = y(cursor + val);
              const h = Math.max(0, y(cursor) - yTop);
              cursor += val;
              return (
                <rect
                  key={key}
                  x={x}
                  y={yTop}
                  width={barW}
                  height={h}
                  fill={colorOf(key)}
                >
                  <title>{`${q.qtrLabel} · ${SERIES.find((s) => s.key === key)?.label}: ${val.toFixed(2)}%`}</title>
                </rect>
              );
            })}
            {/* x-axis label: primary (month or "DD Mon") over year, robustly split */}
            {(() => {
              const [primary, year] = quarterAxisParts(q.qtrLabel);
              return (
                <>
                  <text
                    x={cx}
                    y={PAD.top + PLOT_H + 16}
                    textAnchor="middle"
                    fontSize={9}
                    fontWeight={600}
                    fill="#6b7280"
                  >
                    {primary}
                  </text>
                  <text
                    x={cx}
                    y={PAD.top + PLOT_H + 28}
                    textAnchor="middle"
                    fontSize={8}
                    fill="#9ca3af"
                  >
                    {year}
                  </text>
                </>
              );
            })()}
          </g>
        );
      })}
    </svg>
  );
}

function Legend() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 14,
        padding: "10px 16px 0",
      }}
    >
      {LEGEND_ORDER.map((key) => {
        const s = SERIES.find((x) => x.key === key)!;
        return (
          <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span
              style={{ width: 10, height: 10, borderRadius: 3, background: s.color }}
            />
            <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>{s.label}</span>
          </span>
        );
      })}
    </div>
  );
}

export function ShareholdingTrendCard({ state }: { state: PatternState }) {
  return (
    <WidgetCard
      title="Promoter / FII / DII Trend"
      subtitle="Quarter-over-quarter ownership composition (BSE)"
      style={{ gridColumn: "span 2" }}
    >
      <CardStateGate state={state} loadingRows={6}>
        {(pattern) =>
          pattern.trend.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              No quarterly history to chart yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <Legend />
              <div style={{ padding: "8px 12px 4px" }}>
                <Chart trend={pattern.trend} />
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
