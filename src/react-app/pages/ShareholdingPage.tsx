// Shareholding dashboard shell.
//
// For now this proves the 3-zone shell + navigation + selected-company context:
// the selected company appears in the header ticker pill and the grid renders
// four placeholder widget cards, each in an empty state. Data wiring lands in a
// later session.
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, FileText, PieChart, Users } from "lucide-react";
import { useSelectedCompany } from "@/state/selected-company";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { EmptyState } from "@/components/ui/states";
import type { ReactNode } from "react";

interface PlaceholderWidget {
  title: string;
  subtitle: string;
  icon: ReactNode;
  wide?: boolean;
}

const WIDGETS: PlaceholderWidget[] = [
  {
    title: "Shareholding Summary",
    subtitle: "Latest Promoter / FII / DII / Public split",
    icon: <PieChart size={20} />,
  },
  {
    title: "Promoter / FII / DII Trend",
    subtitle: "Quarter-over-quarter ownership shifts (BSE)",
    icon: <Activity size={20} />,
    wide: true,
  },
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

  // No company selected — return to the selector home screen.
  useEffect(() => {
    if (!company) navigate("/", { replace: true });
  }, [company, navigate]);

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
        {WIDGETS.map((w) => (
          <WidgetCard
            key={w.title}
            title={w.title}
            subtitle={w.subtitle}
            style={w.wide ? { gridColumn: "span 2" } : undefined}
          >
            <EmptyState
              message="Data wiring coming next"
              hint="This widget will populate once the data source is connected."
              icon={w.icon}
            />
          </WidgetCard>
        ))}
      </div>
    </div>
  );
}
