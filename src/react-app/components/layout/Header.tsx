// Zone 1 — sticky header (exactly 48px). Shows the title and, when a company is
// selected, the indigo ticker pill plus a "Change" action.
import { useNavigate } from "react-router-dom";
import { useSelectedCompany } from "@/state/selected-company";
import { TickerPill } from "@/components/ui/TickerPill";

export function Header() {
  const { company } = useSelectedCompany();
  const navigate = useNavigate();

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
        )}
      </div>
    </header>
  );
}
