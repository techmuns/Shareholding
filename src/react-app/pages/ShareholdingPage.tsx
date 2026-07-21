// Shareholding dashboard.
//
// All four cards are wired to live data: "Shareholding Summary", "Promoter / FII
// / DII Trend" and "Individual Holders" from BSE shareholding-pattern feeds, and
// "Insider Trading Disclosures" from SEBI PIT Reg 7(2) feeds (NSE primary, BSE
// fallback).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelectedCompany } from "@/state/selected-company";
import {
  getInsiderDisclosures,
  getShareholdingHolders,
  getShareholdingPattern,
} from "@/lib/api";
import { ShareholdingSummaryCard } from "@/components/shareholding/ShareholdingSummaryCard";
import { ShareholdingTrendCard } from "@/components/shareholding/ShareholdingTrendCard";
import { IndividualHoldersCard } from "@/components/shareholding/IndividualHoldersCard";
import { InsiderDisclosuresCard } from "@/components/shareholding/InsiderDisclosuresCard";
import {
  isIndiaCountry,
  type HoldersState,
  type InsiderState,
  type PatternState,
} from "@/components/shareholding/common";

export default function ShareholdingPage() {
  const { company } = useSelectedCompany();
  const navigate = useNavigate();
  const [patternState, setPatternState] = useState<PatternState>({ status: "loading" });
  const [holdersState, setHoldersState] = useState<HoldersState>({ status: "loading" });
  const [insiderState, setInsiderState] = useState<InsiderState>({ status: "loading" });

  // No company selected — return to the selector home screen.
  useEffect(() => {
    if (!company) navigate("/", { replace: true });
  }, [company, navigate]);

  // Fetch the BSE pattern + holders for the selected company. Both requests share
  // one AbortController so a company change cancels stale work; clearly non-Indian
  // companies short-circuit to a clean empty state (BSE coverage is India-only).
  // The Worker's in-isolate resolve cache means the two calls don't re-resolve
  // the scrip code upstream twice.
  useEffect(() => {
    if (!company) return;

    if (company.country && !isIndiaCountry(company.country)) {
      setPatternState({ status: "unavailable" });
      setHoldersState({ status: "unavailable" });
      setInsiderState({ status: "unavailable" });
      return;
    }

    setPatternState({ status: "loading" });
    setHoldersState({ status: "loading" });
    setInsiderState({ status: "loading" });
    const controller = new AbortController();
    const req = { query: company.name || company.ticker, ticker: company.ticker, name: company.name };

    (async () => {
      try {
        const res = await getShareholdingPattern(req, controller.signal);
        if (controller.signal.aborted) return;
        if (res.ok) setPatternState({ status: "done", pattern: res });
        else if (res.code === "not_found") setPatternState({ status: "unavailable" });
        else setPatternState({ status: "error", message: res.message });
      } catch {
        // Aborted (company changed) — ignore.
      }
    })();

    (async () => {
      try {
        const res = await getShareholdingHolders(req, controller.signal);
        if (controller.signal.aborted) return;
        if (res.ok) setHoldersState({ status: "done", holders: res });
        else if (res.code === "not_found") setHoldersState({ status: "unavailable" });
        else setHoldersState({ status: "error", message: res.message });
      } catch {
        // Aborted (company changed) — ignore.
      }
    })();

    (async () => {
      try {
        const res = await getInsiderDisclosures(
          { symbol: company.ticker, name: company.name, query: company.name || company.ticker },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (res.ok) setInsiderState({ status: "done", insider: res });
        else if (res.code === "not_found") setInsiderState({ status: "unavailable" });
        else setInsiderState({ status: "error", message: res.message });
      } catch {
        // Aborted (company changed) — ignore.
      }
    })();

    return () => controller.abort();
  }, [company]);

  if (!company) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>
          {company.name || company.ticker}
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#6b7280" }}>
          {[company.sector, company.country].filter(Boolean).join(" · ") ||
            "Shareholding overview"}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gap: 20,
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
        }}
      >
        <ShareholdingSummaryCard state={patternState} />
        <ShareholdingTrendCard state={patternState} />
        <IndividualHoldersCard state={holdersState} />
        <InsiderDisclosuresCard state={insiderState} />
      </div>
    </div>
  );
}
