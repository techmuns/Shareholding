// Zone 1 — sticky header (exactly 48px). A back button (when a company is
// selected) sits left of the title; the indigo ticker pill and Refresh / Export
// (Excel) actions sit on the right.
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { useSelectedCompany } from "@/state/selected-company";
import { useDashboardData } from "@/state/dashboard-data";
import { TickerPill } from "@/components/ui/TickerPill";
import { exportDashboardXlsx } from "@/lib/export";

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
    exportDashboardXlsx({
      company,
      generatedAt: new Date().toISOString(),
      pattern: data.patternState.status === "done" ? data.patternState.pattern : undefined,
      holders: data.holdersState.status === "done" ? data.holdersState.holders : undefined,
      insider: data.insiderState.status === "done" ? data.insiderState.insider : undefined,
      history: data.historyState.status === "done" ? data.historyState.history : undefined,
    });
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
        {company && (
          <button
            type="button"
            onClick={() => navigate("/")}
            title="Back to company selection"
            aria-label="Back to company selection"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              width: 28,
              height: 28,
              color: "#4338ca",
              background: "#eef2ff",
              border: "1px solid #e0e7ff",
              borderRadius: 8,
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={16} />
          </button>
        )}
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
              title="Download all loaded data as an Excel workbook"
              style={actionBtn(!data.hasAnyData)}
            >
              <Download size={13} />
              Export
            </button>
          </>
        )}
      </div>
    </header>
  );
}
