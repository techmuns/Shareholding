// "Individual Holders" card — named Promoter / FII·FPI / DII / Other-Public
// holders BSE discloses for the latest quarter, as a tabbed, sortable table.
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { HolderCategory, IndividualHolder } from "@shared/types";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { HoldersStateGate, SourceLine, type HoldersState } from "./common";
import { useDashboardData } from "@/state/dashboard-data";

interface GroupDef {
  key: HolderCategory;
  label: string;
  color: string;
  emptyMsg: string;
}

// Palette mirrors the trend chart for a consistent read across cards.
const GROUPS: GroupDef[] = [
  {
    key: "promoter",
    label: "Promoters",
    color: "#4f46e5",
    emptyMsg: "No promoter entities disclosed for this quarter.",
  },
  {
    key: "fii",
    label: "FII / FPI",
    color: "#0d9488",
    emptyMsg: "No FII/FPI holder above BSE's 1% disclosure threshold.",
  },
  {
    key: "dii",
    label: "DII",
    color: "#d97706",
    emptyMsg: "No DII holder above BSE's 1% disclosure threshold.",
  },
  {
    key: "public",
    label: "Other Public",
    color: "#6b7280",
    emptyMsg: "No other public holder above BSE's 1% disclosure threshold.",
  },
];

const fmtShares = (n: number) => n.toLocaleString("en-IN");
const fmtPct = (n: number) => `${n.toFixed(2)}%`;

function CategoryChip({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 10,
        fontWeight: 600,
        color,
        background: `${color}14`,
        border: `1px solid ${color}33`,
        borderRadius: 6,
        padding: "1px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function HoldersTable({
  holders,
  group,
  showPledge,
}: {
  holders: IndividualHolder[];
  group: GroupDef;
  showPledge: boolean;
}) {
  const [desc, setDesc] = useState(true);

  const rows = useMemo(
    () => [...holders].sort((a, b) => (desc ? b.pct - a.pct : a.pct - b.pct)),
    [holders, desc],
  );

  if (holders.length === 0) {
    return (
      <div
        style={{
          minHeight: 140,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: 24,
          fontSize: 13,
          color: "#9ca3af",
        }}
      >
        {group.emptyMsg}
      </div>
    );
  }

  const th: React.CSSProperties = {
    position: "sticky",
    top: 0,
    background: "rgba(249,250,251,0.98)",
    backdropFilter: "blur(4px)",
    textAlign: "right",
    fontSize: 11,
    fontWeight: 600,
    color: "#6b7280",
    padding: "8px 12px",
    borderBottom: "1px solid rgba(229,231,235,0.9)",
    whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    textAlign: "right",
    fontSize: 12,
    color: "#374151",
    padding: "8px 12px",
    borderBottom: "1px solid rgba(229,231,235,0.6)",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ maxHeight: 320, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left", width: "42%" }}>Holder</th>
            <th
              style={{ ...th, cursor: "pointer", userSelect: "none" }}
              onClick={() => setDesc((d) => !d)}
              title="Sort by % holding"
            >
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "#4338ca" }}
              >
                % Holding
                {desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />}
              </span>
            </th>
            <th style={th}>Shares</th>
            {showPledge && <th style={th}>Pledged</th>}
            <th style={{ ...th, textAlign: "left" }}>Category</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h, i) => (
            <tr key={`${h.name}-${i}`}>
              <td
                style={{
                  ...td,
                  textAlign: "left",
                  fontWeight: 600,
                  color: "#111827",
                  whiteSpace: "normal",
                }}
              >
                {h.name || "—"}
              </td>
              <td style={{ ...td, fontWeight: 600, color: "#111827" }}>{fmtPct(h.pct)}</td>
              <td style={td}>{fmtShares(h.sharesHeld)}</td>
              {showPledge && (
                <td style={{ ...td, color: h.pledgedPct ? "#dc2626" : "#9ca3af" }}>
                  {h.pledgedPct === undefined ? "—" : fmtPct(h.pledgedPct)}
                </td>
              )}
              <td style={{ ...td, textAlign: "left" }}>
                <CategoryChip color={group.color} label={group.label} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IndividualHoldersCard({ state }: { state: HoldersState }) {
  const { holdersTab: active, setHoldersTab: setActive } = useDashboardData();

  return (
    <WidgetCard
      title="Individual Holders"
      subtitle="Named promoter, FII/FPI, DII & public holders (BSE)"
      style={{ gridColumn: "span 2" }}
    >
      <HoldersStateGate state={state} loadingRows={6}>
        {(holders) => {
          const groupData: Record<HolderCategory, IndividualHolder[]> = {
            promoter: holders.promoters,
            fii: holders.fii,
            dii: holders.dii,
            public: holders.publicOther,
          };
          const activeGroup = GROUPS.find((g) => g.key === active) ?? GROUPS[0];

          return (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {/* tabs */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  padding: "10px 12px",
                  borderBottom: "1px solid rgba(229,231,235,0.8)",
                }}
              >
                {GROUPS.map((g) => {
                  const count = groupData[g.key].length;
                  const on = g.key === active;
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => setActive(g.key)}
                      style={{
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "5px 12px",
                        borderRadius: 8,
                        border: `1px solid ${on ? `${g.color}55` : "rgba(229,231,235,0.9)"}`,
                        background: on ? `${g.color}14` : "#ffffff",
                        color: on ? g.color : "#6b7280",
                      }}
                    >
                      {g.label}
                      <span style={{ marginLeft: 6, opacity: 0.7 }}>{count}</span>
                    </button>
                  );
                })}
              </div>

              <HoldersTable
                holders={groupData[active]}
                group={activeGroup}
                showPledge={active === "promoter"}
              />

              <div style={{ padding: "8px 16px 0", fontSize: 11, color: "#9ca3af" }}>
                {holders.disclosureNote}
              </div>
              <SourceLine
                source="BSE India"
                context={`As of ${holders.qtrLabel}`}
                asOf={holders.asOf}
              />
            </div>
          );
        }}
      </HoldersStateGate>
    </WidgetCard>
  );
}
