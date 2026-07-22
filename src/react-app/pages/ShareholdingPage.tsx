// Shareholding dashboard.
//
// Every card is wired to live data via the shared dashboard-data store:
// "Shareholding Summary", "Promoter / FII / DII Trend" and "Individual Holders"
// from BSE shareholding-pattern feeds; "Insider Trading Disclosures" from the
// Munshot filings API (SEBI PIT); and "Shareholding Pattern (History)" — the
// multi-quarter, holder-level pattern parsed from the Munshot combined-financials
// feed. Each card fetches independently — one failing never blanks the others.
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSelectedCompany } from "@/state/selected-company";
import { useDashboardData } from "@/state/dashboard-data";
import { ShareholdingSummaryCard } from "@/components/shareholding/ShareholdingSummaryCard";
import { ShareholdingTrendCard } from "@/components/shareholding/ShareholdingTrendCard";
import { IndividualHoldersCard } from "@/components/shareholding/IndividualHoldersCard";
import { InsiderDisclosuresCard } from "@/components/shareholding/InsiderDisclosuresCard";
import { ShareholdingHistoryCard } from "@/components/shareholding/ShareholdingHistoryCard";
import { DataSourcesFooter } from "@/components/shareholding/DataSourcesFooter";

export default function ShareholdingPage() {
  const { company } = useSelectedCompany();
  const navigate = useNavigate();
  const { patternState, holdersState, insiderState, historyState } = useDashboardData();

  // No company selected — return to the selector home screen.
  useEffect(() => {
    if (!company) navigate("/", { replace: true });
  }, [company, navigate]);

  if (!company) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ width: "100%", maxWidth: 1440, margin: "0 auto" }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827", letterSpacing: "-0.01em" }}>
          {company.name || company.ticker}
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#6b7280" }}>
          {[company.sector, company.country].filter(Boolean).join(" · ") || "Shareholding overview"}
        </p>
      </div>

      <div className="dash-grid">
        <ShareholdingSummaryCard state={patternState} />
        <ShareholdingTrendCard state={patternState} />
        <IndividualHoldersCard state={holdersState} />
        <ShareholdingHistoryCard state={historyState} />
        <InsiderDisclosuresCard state={insiderState} />
        <DataSourcesFooter />
      </div>
    </div>
  );
}
