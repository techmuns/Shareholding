// "Shareholding Changes" — the analytics hero pinned to the top of the dashboard.
//
// This is the value-over-Screener layer: instead of making the user scan
// quarterly tables, it computes and surfaces WHAT CHANGED — promoter move (the
// headline metric), FII/DII/Public shifts, streaks, pledge, the biggest named-
// holder moves, and one-line insights. It reads the same feeds the detail cards
// below use (BSE pattern + promoter pledge, Munshot multi-quarter history), so
// nothing here duplicates a table — it's the summary those tables substantiate.
import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, Landmark, Minus, TrendingUp } from "lucide-react";
import type { ShareholdingPatternSuccess } from "@shared/types";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import { SourceLine, type HoldersState, type PatternState, type ShareholdingHistoryCardState } from "./common";
import {
  buildInsights,
  computeCategoryChanges,
  computePromoterPledge,
  computeTopMovers,
  type CategoryChange,
  type HolderMove,
} from "@shared/shareholdingAnalytics";

const UP = "#059669";
const DOWN = "#dc2626";
const FLAT = "#6b7280";

const fmtPts = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(2)}`;

/** Signed, colored delta with a directional arrow (percentage points). */
function DeltaBadge({ v, suffix = "pts", size = 12 }: { v: number | null; suffix?: string; size?: number }) {
  if (v === null) return <span style={{ color: "#9ca3af", fontSize: size }}>—</span>;
  const flat = Math.abs(v) < 0.01;
  const color = flat ? FLAT : v > 0 ? UP : DOWN;
  const Icon = flat ? Minus : v > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color, fontWeight: 700, fontSize: size }}>
      <Icon size={size + 1} />
      {fmtPts(v)} {suffix}
    </span>
  );
}

function StreakTag({ streak }: { streak: number }) {
  if (Math.abs(streak) < 2) return null;
  const up = streak > 0;
  const color = up ? UP : DOWN;
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color,
        background: `${color}14`,
        border: `1px solid ${color}33`,
        borderRadius: 6,
        padding: "1px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {up ? "↑" : "↓"} {Math.abs(streak)} quarters
    </span>
  );
}

/** Tiny zero-baseline bar sparkline of QoQ deltas (green up / red down). */
function DeltaSparkline({ deltas }: { deltas: number[] }) {
  const data = deltas.slice(-8);
  if (data.length === 0) return null;
  const w = 88;
  const h = 30;
  const mid = h / 2;
  const max = Math.max(0.1, ...data.map((d) => Math.abs(d)));
  const bw = w / data.length;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Promoter change per quarter">
      <line x1={0} y1={mid} x2={w} y2={mid} stroke="rgba(229,231,235,0.9)" strokeWidth={1} />
      {data.map((d, i) => {
        const bh = (Math.abs(d) / max) * (mid - 2);
        const x = i * bw + bw * 0.2;
        const bwi = bw * 0.6;
        const y = d >= 0 ? mid - bh : mid;
        return (
          <rect key={i} x={x} y={y} width={bwi} height={Math.max(0.6, bh)} rx={1.5} fill={d >= 0 ? UP : DOWN}>
            <title>{fmtPts(d)} pts</title>
          </rect>
        );
      })}
    </svg>
  );
}

function CategoryChip({ c }: { c: CategoryChange }) {
  return (
    <div
      style={{
        border: "1px solid rgba(229,231,235,0.9)",
        borderRadius: 12,
        background: "#ffffff",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600, color: "#6b7280" }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: c.color, flexShrink: 0 }} />
        {c.label}
        {c.isHigh && <HiLo label="HIGH" color={UP} />}
        {c.isLow && <HiLo label="LOW" color={DOWN} />}
      </span>
      <span style={{ fontSize: 19, fontWeight: 700, color: "#111827", fontVariantNumeric: "tabular-nums" }}>
        {c.latest.toFixed(2)}
        <span style={{ fontSize: 12, fontWeight: 600, color: "#9ca3af" }}>%</span>
      </span>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <DeltaBadge v={c.qoq} suffix="QoQ" size={11} />
        <StreakTag streak={c.streak} />
      </div>
    </div>
  );
}

function HiLo({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        color,
        background: `${color}14`,
        border: `1px solid ${color}33`,
        borderRadius: 5,
        padding: "0 5px",
        letterSpacing: "0.02em",
      }}
    >
      {label}
    </span>
  );
}

const MOVE_STYLE: Record<HolderMove["kind"], { label: string; color: string; bg: string }> = {
  up: { label: "ADDED", color: UP, bg: "#ecfdf5" },
  down: { label: "TRIMMED", color: DOWN, bg: "#fef2f2" },
  new: { label: "NEW", color: "#4338ca", bg: "#eef2ff" },
  exit: { label: "EXIT", color: "#6b7280", bg: "#f3f4f6" },
};

function MoverPill({ m }: { m: HolderMove }) {
  const s = MOVE_STYLE[m.kind];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        border: "1px solid rgba(229,231,235,0.9)",
        borderRadius: 10,
        background: "#ffffff",
        padding: "7px 10px",
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: s.color,
          background: s.bg,
          border: `1px solid ${s.color}33`,
          borderRadius: 5,
          padding: "1px 6px",
          flexShrink: 0,
          letterSpacing: "0.02em",
        }}
      >
        {s.label}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: "#111827",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 220,
          }}
          title={m.name}
        >
          {m.name}
        </div>
        <div style={{ fontSize: 11, color: "#9ca3af" }}>
          {m.category} · <span style={{ color: s.color, fontWeight: 600 }}>{fmtPts(m.delta)} pts</span>
        </div>
      </div>
    </div>
  );
}

export function ShareholdingChangesCard({
  patternState,
  holdersState,
  historyState,
}: {
  patternState: PatternState;
  holdersState: HoldersState;
  historyState: ShareholdingHistoryCardState;
}) {
  const pattern = patternState.status === "done" ? patternState.pattern : undefined;
  const holders = holdersState.status === "done" ? holdersState.holders : undefined;
  const history = historyState.status === "done" ? historyState.history : undefined;

  const changes = useMemo(() => (pattern ? computeCategoryChanges(pattern.trend) : []), [pattern]);
  const pledge = useMemo(() => computePromoterPledge(holders?.promoters ?? []), [holders]);
  const movers = useMemo(() => computeTopMovers(history, 4), [history]);
  const insights = useMemo(() => buildInsights(changes, pledge).slice(0, 2), [changes, pledge]);

  return (
    <WidgetCard
      title="Shareholding Changes"
      subtitle="What moved this quarter — promoter, institutions & top holders"
      className="span-12"
      headerRight={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#9ca3af" }}>
          <TrendingUp size={13} /> analytics
        </span>
      }
    >
      {patternState.status === "loading" ? (
        <LoadingSkeleton rows={5} />
      ) : patternState.status === "unavailable" ? (
        <EmptyState
          message="Shareholding data isn't available for this company."
          hint="This dashboard reads from BSE's main board. NSE-only or NSE SME (Emerge) listings and non-Indian tickers aren't covered."
          icon={<Landmark size={20} />}
        />
      ) : patternState.status === "error" ? (
        <ErrorState message="Couldn't compute shareholding changes" hint={patternState.message} />
      ) : (
        <ChangesBody
          pattern={pattern!}
          promoter={changes.find((c) => c.key === "promoter")}
          categories={changes.filter((c) => c.key !== "promoter")}
          pledge={pledge}
          insights={insights}
          movers={movers}
          moversReady={historyState.status === "done"}
        />
      )}
    </WidgetCard>
  );
}

function ChangesBody({
  pattern,
  promoter,
  categories,
  pledge,
  insights,
  movers,
  moversReady,
}: {
  pattern: ShareholdingPatternSuccess;
  promoter: CategoryChange | undefined;
  categories: CategoryChange[];
  pledge: { pledgePct: number; hasData: boolean };
  insights: string[];
  movers: HolderMove[];
  moversReady: boolean;
}) {
  const qtr = pattern.latest.qtrLabel;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      {/* Row 1: promoter headline (left) + category chips (right) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(240px, 1fr) minmax(320px, 1.6fr)",
          gap: 14,
          padding: "16px",
          alignItems: "stretch",
        }}
      >
        {promoter && (
          <div
            style={{
              border: "1px solid #e0e7ff",
              background: "linear-gradient(180deg,#f5f6ff, #ffffff)",
              borderRadius: 14,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: "#4338ca" }}>Promoter holding</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 34, fontWeight: 800, color: "#111827", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {promoter.latest.toFixed(2)}
                <span style={{ fontSize: 16, fontWeight: 700, color: "#9ca3af" }}>%</span>
              </span>
              <StreakTag streak={promoter.streak} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", flexDirection: "column" }}>
                <DeltaBadge v={promoter.qoq} suffix="QoQ" size={13} />
              </span>
              <span style={{ display: "inline-flex", flexDirection: "column" }}>
                <DeltaBadge v={promoter.yoy} suffix="1yr" size={13} />
              </span>
              <DeltaSparkline deltas={promoter.deltas} />
            </div>
            {pledge.hasData && (
              <div style={{ fontSize: 11.5, color: pledge.pledgePct >= 25 ? "#b45309" : "#6b7280" }}>
                Pledge:{" "}
                <span style={{ fontWeight: 700, color: pledge.pledgePct > 0 ? (pledge.pledgePct >= 25 ? "#b45309" : "#374151") : UP }}>
                  {pledge.pledgePct.toFixed(2)}%
                </span>{" "}
                of promoter holding
              </div>
            )}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {categories.map((c) => (
            <CategoryChip key={c.key} c={c} />
          ))}
        </div>
      </div>

      {/* Row 2: insights */}
      {insights.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 16px 12px" }}>
          {insights.map((line, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 9,
                alignItems: "flex-start",
                fontSize: 12.5,
                color: "#374151",
                lineHeight: 1.45,
                background: "rgba(238,242,255,0.5)",
                border: "1px solid rgba(224,231,255,0.9)",
                borderRadius: 10,
                padding: "8px 12px",
              }}
            >
              <TrendingUp size={14} color="#4338ca" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{line}</span>
            </div>
          ))}
        </div>
      )}

      {/* Row 3: top holder movers */}
      {moversReady && movers.length > 0 && (
        <div style={{ padding: "0 16px 14px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 8 }}>
            Biggest holder moves this quarter
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 8,
            }}
          >
            {movers.map((m, i) => (
              <MoverPill key={`${m.name}-${i}`} m={m} />
            ))}
          </div>
        </div>
      )}

      <div style={{ flex: 1 }} />
      <SourceLine
        source="BSE India + Munshot"
        context={`Changes vs prior quarter · as of ${qtr}`}
        asOf={pattern.asOf}
        note="Computed on top of the shareholding data below"
      />
    </div>
  );
}
