// Zone 1 — sticky header (exactly 48px). Shows the title and, when a company is
// selected, the indigo ticker pill plus Refresh / Export / Change actions.
import { useNavigate } from "react-router-dom";
import { Download, RefreshCw } from "lucide-react";
import { useSelectedCompany } from "@/state/selected-company";
import { useDashboardData } from "@/state/dashboard-data";
import { TickerPill } from "@/components/ui/TickerPill";
import { buildDashboardCsv, downloadCsv, exportFilename } from "@/lib/export";

const actionBtn = (disabled: boolean) =>
  ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: 12,
    fontWeight: 600,
    color: disabled ? "#9ca3af" : "#4338ca",
    background: disabled ? "#f3f4f6" : "#eef2ff",
    border: `1px solid ${disabled ? "#e5e7eb" : "#e0e7ff"}`,
    borderRadius: 8,
    padding: "5px 12px",
    opacity: disabled ? 0.7 : 1,
  }) as const;

export function Header() {
  const { company } = useSelectedCompany();
  const data = useDashboardData();
  const navigate = useNavigate();

  const onExport = () => {
    if (!company || !data.hasAnyData) return;
    const generatedAt = new Date().toISOString();
    const csv = buildDashboardCsv({
      company,
      generatedAt,
      pattern: data.patternState.status === "done" ? data.patternState.pattern : undefined,
      holders: data.holdersState.status === "done" ? data.holdersState.holders : undefined,
      insider: data.insiderState.status === "done" ? data.insiderState.insider : undefined,
      financials: data.financialsState.status === "done" ? data.financialsState.financials : undefined,
    });
    downloadCsv(exportFilename(company, generatedAt), csv);
  };

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        height: 48,
        background: "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid #e5e7eb",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <h1 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>Shareholding</h1>
        {company && <TickerPill ticker={company.ticker} company={company.name} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {company && (
          <>
            <button
              type="button"
              onClick={() => data.refresh()}
              disabled={data.isRefreshing}
              title="Re-fetch all cards"
              style={actionBtn(data.isRefreshing)}
            >
              <RefreshCw size={13} className={data.isRefreshing ? "spin" : undefined} />
              {data.isRefreshing ? "Refreshing" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={onExport}
              disabled={!data.hasAnyData}
              title="Download all loaded data as CSV"
              style={actionBtn(!data.hasAnyData)}
            >
              <Download size={13} />
              Export
            </button>
            <button
              type="button"
              onClick={() => navigate("/")}
              style={{
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                color: "#4338ca",
                background: "#eef2ff",
                border: "1px solid #e0e7ff",
                borderRadius: 8,
                padding: "5px 12px",
              }}
            >
              Change
            </button>
          </>
        )}
      </div>
    </header>
  );
}
