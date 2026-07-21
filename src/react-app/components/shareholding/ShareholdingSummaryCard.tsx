// "Shareholding Summary" card — KPI row for the latest quarter with QoQ deltas.
import type { ShareholdingCategoryBreakdown, ShareholdingQuarter } from "@shared/types";
import { publicFloatPct, qoqDelta } from "@shared/bseShareholding";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { CardStateGate, SourceLine, type PatternState } from "./common";

interface Kpi {
  label: string;
  value: number;
  delta: number | null;
}

function buildKpis(
  latest: ShareholdingQuarter,
  prior: ShareholdingQuarter | undefined,
): Kpi[] {
  const pick = (fn: (b: ShareholdingCategoryBreakdown) => number) => ({
    value: fn(latest.breakdown),
    delta: qoqDelta(latest, prior, fn),
  });
  return [
    { label: "Promoter", ...pick((b) => b.promoterPct) },
    { label: "FII / FPI", ...pick((b) => b.fiiPct) },
    { label: "DII", ...pick((b) => b.diiPct) },
    { label: "Public", ...pick(publicFloatPct) },
  ];
}

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span style={{ fontSize: 11, color: "#9ca3af" }}>no prior quarter</span>;
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

export function ShareholdingSummaryCard({ state }: { state: PatternState }) {
  return (
    <WidgetCard
      title="Shareholding Summary"
      subtitle="Latest quarter · Promoter / FII / DII / Public"
    >
      <CardStateGate state={state} loadingRows={4}>
        {(pattern) => {
          const { latest, trend } = pattern;
          const prior = trend.length >= 2 ? trend[trend.length - 2] : undefined;
          const kpis = buildKpis(latest, prior);
          return (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "12px 16px 4px", fontSize: 11, color: "#9ca3af" }}>
                as of {latest.qtrLabel}
              </div>
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                  padding: "4px 16px 16px",
                }}
              >
                {kpis.map((k) => (
                  <div
                    key={k.label}
                    style={{
                      border: "1px solid rgba(229,231,235,0.9)",
                      borderRadius: 12,
                      background: "#ffffff",
                      padding: "12px 14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>
                      {k.label}
                    </span>
                    <span style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>
                      {k.value.toFixed(2)}
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#9ca3af" }}>%</span>
                    </span>
                    <DeltaChip delta={k.delta} />
                  </div>
                ))}
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
