// "Data Sources & Freshness" footer — one compact card summarizing provenance
// and freshness for all four cards, reflecting the REAL feeds that returned data.
import { WidgetCard } from "@/components/ui/WidgetCard";
import { formatAsOf } from "./common";
import { useDashboardData } from "@/state/dashboard-data";

function statusText(status: "loading" | "unavailable" | "error" | "done"): {
  label: string;
  color: string;
} {
  switch (status) {
    case "done":
      return { label: "loaded", color: "#059669" };
    case "loading":
      return { label: "loading…", color: "#9ca3af" };
    case "unavailable":
      return { label: "not available", color: "#9ca3af" };
    case "error":
      return { label: "failed", color: "#dc2626" };
  }
}

function SourceTile({
  title,
  detail,
  status,
}: {
  title: string;
  detail: string;
  status: "loading" | "unavailable" | "error" | "done";
}) {
  const s = statusText(status);
  return (
    <div
      style={{
        border: "1px solid rgba(229,231,235,0.9)",
        borderRadius: 12,
        background: "#ffffff",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{title}</div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: s.color,
            background: `${s.color}14`,
            border: `1px solid ${s.color}33`,
            borderRadius: 6,
            padding: "1px 7px",
            whiteSpace: "nowrap",
          }}
        >
          {s.label}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.4 }}>{detail}</div>
    </div>
  );
}

export function DataSourcesFooter() {
  const { patternState, holdersState, insiderState, financialsState, lastRefreshed } =
    useDashboardData();

  const pattern = patternState.status === "done" ? patternState.pattern : undefined;
  const holders = holdersState.status === "done" ? holdersState.holders : undefined;
  const insider = insiderState.status === "done" ? insiderState.insider : undefined;
  const financials = financialsState.status === "done" ? financialsState.financials : undefined;

  const patternDetail = pattern
    ? `BSE India · shareholding pattern · as of ${pattern.latest.qtrLabel}`
    : "BSE India · shareholding pattern";

  const holdersDetail = holders
    ? `BSE India · named holders as of ${holders.qtrLabel} · >1% disclosure threshold`
    : "BSE India · named holders · >1% disclosure threshold";

  let insiderDetail: string;
  if (insider) {
    const provider = insider.sources.length > 0 ? insider.sources.join(" · ") : "Munshot";
    const range =
      insider.trades.length > 0 ? ` · ${insider.windowFrom} – ${insider.windowTo}` : "";
    insiderDetail = `SEBI PIT insider dealings · via Munshot (${provider})${range}`;
  } else {
    insiderDetail = "SEBI PIT insider dealings · via Munshot filings API";
  }

  const financialsDetail = financials
    ? `Munshot · fundamentals & statements · ${financials.basis} · ${financials.period}`
    : "Munshot · fundamentals & financial statements";

  const refreshedWhen = lastRefreshed ? formatAsOf(lastRefreshed) : "—";

  return (
    <WidgetCard
      title="Data Sources & Freshness"
      subtitle="Provenance and last-refreshed time for every card"
      className="span-12"
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
          padding: "14px 16px",
        }}
      >
        <SourceTile title="Summary & Trend" detail={patternDetail} status={patternState.status} />
        <SourceTile title="Fundamentals & Statements" detail={financialsDetail} status={financialsState.status} />
        <SourceTile title="Individual Holders" detail={holdersDetail} status={holdersState.status} />
        <SourceTile title="Insider Disclosures" detail={insiderDetail} status={insiderState.status} />
      </div>
      <div
        style={{
          padding: "8px 16px",
          borderTop: "1px solid rgba(229,231,235,0.8)",
          fontSize: 11,
          color: "#9ca3af",
        }}
      >
        Last refreshed: {refreshedWhen}
      </div>
    </WidgetCard>
  );
}
