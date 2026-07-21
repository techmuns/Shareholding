// "Shareholding Summary" card — a latest-quarter ownership donut beside a compact
// KPI grid (each with its QoQ delta). Donut + KPIs form one 100% partition that
// matches the trend chart's series (Promoter / FII·FPI / DII / Public).
import type { ShareholdingCategoryBreakdown } from "@shared/types";
import { qoqDelta, stackRemainderPct } from "@shared/bseShareholding";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { CardStateGate, SourceLine, type PatternState } from "./common";

// Series palette — validated colorblind-safe (matches the trend chart).
const SERIES = [
  { key: "promoter", label: "Promoter", color: "#4f46e5", pick: (b: ShareholdingCategoryBreakdown) => b.promoterPct },
  { key: "fii", label: "FII / FPI", color: "#0d9488", pick: (b: ShareholdingCategoryBreakdown) => b.fiiPct },
  { key: "dii", label: "DII", color: "#d97706", pick: (b: ShareholdingCategoryBreakdown) => b.diiPct },
  { key: "public", label: "Public", color: "#9ca3af", pick: stackRemainderPct },
] as const;

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span style={{ fontSize: 11, color: "#9ca3af" }}>—</span>;
  }
  const up = delta > 0;
  const flat = delta === 0;
  const color = flat ? "#6b7280" : up ? "#059669" : "#dc2626";
  const sign = up ? "+" : flat ? "" : "−";
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color }}>
      {sign}
      {Math.abs(delta).toFixed(2)} pts QoQ
    </span>
  );
}

/** SVG ring donut with a 3px gap between segments and a centered quarter label. */
function Donut({ slices, centerLabel }: { slices: { label: string; value: number; color: string }[]; centerLabel: string }) {
  const size = 176;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Latest ownership composition">
      {/* track */}
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(229,231,235,0.7)" strokeWidth={stroke} />
      {slices.map((s) => {
        const len = (Math.max(0, s.value) / 100) * c;
        const gap = s.value > 1.2 ? 3 : 0; // no gap for tiny slivers
        const dash = Math.max(0.5, len - gap);
        const el = (
          <circle
            key={s.label}
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cx})`}
          >
            <title>{`${s.label}: ${s.value.toFixed(2)}%`}</title>
          </circle>
        );
        offset += len;
        return el;
      })}
      <text x={cx} y={cx - 6} textAnchor="middle" fontSize={11} fill="#9ca3af">
        as of
      </text>
      <text x={cx} y={cx + 12} textAnchor="middle" fontSize={15} fontWeight={700} fill="#111827">
        {centerLabel}
      </text>
    </svg>
  );
}

export function ShareholdingSummaryCard({ state }: { state: PatternState }) {
  return (
    <WidgetCard
      title="Shareholding Summary"
      subtitle="Latest quarter · Promoter / FII / DII / Public"
      className="span-5"
    >
      <CardStateGate state={state} loadingRows={5}>
        {(pattern) => {
          const { latest, trend } = pattern;
          const prior = trend.length >= 2 ? trend[trend.length - 2] : undefined;
          const slices = SERIES.map((s) => ({ label: s.label, value: s.pick(latest.breakdown), color: s.color }));

          return (
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  gap: 20,
                  padding: "18px 16px",
                  alignItems: "center",
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                <Donut slices={slices} centerLabel={latest.qtrLabel} />
                <div
                  style={{
                    flex: 1,
                    minWidth: 200,
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 10,
                    alignContent: "center",
                  }}
                >
                  {SERIES.map((s) => (
                    <div
                      key={s.key}
                      style={{
                        border: "1px solid rgba(229,231,235,0.9)",
                        borderRadius: 12,
                        background: "#ffffff",
                        padding: "10px 12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#6b7280",
                        }}
                      >
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                        {s.label}
                      </span>
                      <span
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          color: "#111827",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {s.pick(latest.breakdown).toFixed(2)}
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af" }}>%</span>
                      </span>
                      <DeltaChip delta={qoqDelta(latest, prior, s.pick)} />
                    </div>
                  ))}
                </div>
              </div>
              <SourceLine
                source="BSE India"
                context={`As of ${latest.qtrLabel}`}
                asOf={pattern.asOf}
                warn={pattern.partial ? "Some figures may be partial" : undefined}
              />
            </div>
          );
        }}
      </CardStateGate>
    </WidgetCard>
  );
}
