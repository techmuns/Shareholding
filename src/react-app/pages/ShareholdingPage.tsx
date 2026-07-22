// Shareholding dashboard.
//
// The top card, "Shareholding Changes", is the analytics/insight layer — it
// computes what MOVED (promoter, FII/DII/Public, streaks, pledge, top holder
// moves, plain-English insights) so users don't have to scan the tables below.
// Everything under it is the raw detail it summarizes: "Promoter / FII / DII
// Trend" and "Individual Holders" from BSE; "Shareholding Pattern (History)"
// from the Munshot combined-financials feed; and "Insider Trading Disclosures"
// from the Munshot filings API. Each fetches independently — one failing never
// blanks the others, and no card repeats another's data.
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSelectedCompany } from "@/state/selected-company";
import { useDashboardData } from "@/state/dashboard-data";
import { ShareholdingChangesCard } from "@/components/shareholding/ShareholdingChangesCard";
import { ShareholdingTrendCard } from "@/components/shareholding/ShareholdingTrendCard";
import { IndividualHoldersCard } from "@/components/shareholding/IndividualHoldersCard";
import { InsiderDisclosuresCard } from "@/components/shareholding/InsiderDisclosuresCard";
import { ShareholdingHistoryCard } from "@/components/shareholding/ShareholdingHistoryCard";

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
        <ShareholdingChangesCard
          patternState={patternState}
          holdersState={holdersState}
          historyState={historyState}
        />
        <ShareholdingTrendCard state={patternState} />
        <IndividualHoldersCard state={holdersState} />
        <ShareholdingHistoryCard state={historyState} />
        <InsiderDisclosuresCard state={insiderState} />
      </div>
    </div>
  );
}
