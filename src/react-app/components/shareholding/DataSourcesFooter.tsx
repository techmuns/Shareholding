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

function Row({
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
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid rgba(229,231,235,0.6)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{title}</div>
        <div style={{ fontSize: 11, color: "#9ca3af" }}>{detail}</div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: s.color, whiteSpace: "nowrap" }}>
        {s.label}
      </span>
    </div>
  );
}

export function DataSourcesFooter() {
  const { patternState, holdersState, insiderState, lastRefreshed } = useDashboardData();

  const pattern = patternState.status === "done" ? patternState.pattern : undefined;
  const holders = holdersState.status === "done" ? holdersState.holders : undefined;
  const insider = insiderState.status === "done" ? insiderState.insider : undefined;

  const patternDetail = pattern
    ? `BSE India · shareholding pattern · as of ${pattern.latest.qtrLabel}`
    : "BSE India · shareholding pattern";

  const holdersDetail = holders
    ? `BSE India · named holders as of ${holders.qtrLabel} · >1% disclosure threshold`
    : "BSE India · named holders · >1% disclosure threshold";

  let insiderDetail: string;
  if (insider) {
    const feeds = insider.sources;
    let provenance: string;
    if (feeds.length === 0) provenance = "NSE & BSE checked — no disclosures returned";
    else if (feeds.includes("NSE") && feeds.includes("BSE")) provenance = "NSE + BSE";
    else if (feeds.includes("BSE")) provenance = "NSE unavailable — BSE provided the data";
    else provenance = "NSE";
    insiderDetail = `SEBI PIT Reg 7(2) · ${provenance} · window ${insider.windowFrom} – ${insider.windowTo}`;
  } else {
    insiderDetail = "SEBI PIT Reg 7(2) · NSE (primary) + BSE (fallback)";
  }

  const refreshedWhen = lastRefreshed ? formatAsOf(lastRefreshed) : "—";

  return (
    <WidgetCard
      title="Data Sources & Freshness"
      subtitle="Provenance and last-refreshed time for every card"
      style={{ gridColumn: "1 / -1" }}
    >
      <div style={{ padding: "6px 16px 4px" }}>
        <Row title="Shareholding Summary & Trend" detail={patternDetail} status={patternState.status} />
        <Row title="Individual Holders" detail={holdersDetail} status={holdersState.status} />
        <Row title="Insider Trading Disclosures" detail={insiderDetail} status={insiderState.status} />
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
