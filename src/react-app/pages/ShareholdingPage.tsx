// Shareholding dashboard.
//
// The "Shareholding Summary" and "Promoter / FII / DII Trend" cards are wired to
// BSE-backed data (fetched once here and shared). "Individual Holders" and
// "Insider Trading Disclosures" remain placeholders for a later session.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useSelectedCompany } from "@/state/selected-company";
import { getShareholdingPattern } from "@/lib/api";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { EmptyState } from "@/components/ui/states";
import { ShareholdingSummaryCard } from "@/components/shareholding/ShareholdingSummaryCard";
import { ShareholdingTrendCard } from "@/components/shareholding/ShareholdingTrendCard";
import { isIndiaCountry, type PatternState } from "@/components/shareholding/common";

interface PlaceholderWidget {
  title: string;
  subtitle: string;
  icon: ReactNode;
}

const PLACEHOLDERS: PlaceholderWidget[] = [
  {
    title: "Individual Holders",
    subtitle: "Top individual and public shareholders",
    icon: <Users size={20} />,
  },
  {
    title: "Insider Trading Disclosures",
    subtitle: "Recent insider buy / sell filings",
    icon: <FileText size={20} />,
  },
];

export default function ShareholdingPage() {
  const { company } = useSelectedCompany();
  const navigate = useNavigate();
  const [state, setState] = useState<PatternState>({ status: "loading" });

  // No company selected — return to the selector home screen.
  useEffect(() => {
    if (!company) navigate("/", { replace: true });
  }, [company, navigate]);

  // Fetch the BSE shareholding pattern for the selected company. Guards against
  // races by aborting on company change; short-circuits clearly non-Indian
  // companies (BSE coverage is India-only) to a clean empty state.
  useEffect(() => {
    if (!company) return;

    if (company.country && !isIndiaCountry(company.country)) {
      setState({ status: "unavailable" });
      return;
    }

    setState({ status: "loading" });
    const controller = new AbortController();
    (async () => {
      try {
        const res = await getShareholdingPattern(
          { query: company.name || company.ticker, ticker: company.ticker, name: company.name },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (res.ok) setState({ status: "done", pattern: res });
        else if (res.code === "not_found") setState({ status: "unavailable" });
        else setState({ status: "error", message: res.message });
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
        <ShareholdingSummaryCard state={state} />
        <ShareholdingTrendCard state={state} />

        {PLACEHOLDERS.map((w) => (
          <WidgetCard key={w.title} title={w.title} subtitle={w.subtitle}>
            <EmptyState
              message="Data wiring coming next"
              hint="This widget will populate once its data source is connected."
              icon={w.icon}
            />
          </WidgetCard>
        ))}
      </div>
    </div>
  );
}
