// HOME screen — the company selector (NOT a marketing/landing page).
//
// Search by company name or ticker (debounced 300ms, min 2 chars, stale
// requests aborted). Picking a result stores it in the selected-company context
// and routes to the Shareholding dashboard.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Building2, Search } from "lucide-react";
import { searchStocks } from "@/lib/api";
import { useSelectedCompany } from "@/state/selected-company";
import { WidgetCard } from "@/components/ui/WidgetCard";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";
import type { StockSearchResult } from "@shared/types";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; results: StockSearchResult[]; totalResults: number };

export default function CompanySelectPage() {
  const { company, select, clear } = useSelectedCompany();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      setState({ status: "idle" });
      return;
    }

    setState({ status: "loading" });
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await searchStocks(q, controller.signal);
        if (controller.signal.aborted) return;
        if (res.ok) {
          setState({ status: "done", results: res.results, totalResults: res.totalResults });
        } else {
          setState({ status: "error", message: res.message });
        }
      } catch {
        // Aborted stale request — ignore.
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function pick(result: StockSearchResult) {
    select({
      ticker: result.ticker,
      name: result.name,
      country: result.country,
      sector: result.sector,
    });
    navigate("/shareholding");
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ paddingTop: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827" }}>
          Choose a company
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#6b7280" }}>
          Search by company name or ticker to open its shareholding dashboard.
        </p>
      </div>

      {company && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid #e0e7ff",
            background: "#eef2ff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <Building2 size={18} color="#4338ca" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#4338ca" }}>
                {company.ticker}
                <span style={{ fontWeight: 400, color: "#6366f1" }}> — {company.name}</span>
              </div>
              <div style={{ fontSize: 11, color: "#818cf8" }}>Currently selected</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button type="button" onClick={() => navigate("/shareholding")} style={primaryBtn}>
              Open <ArrowRight size={14} />
            </button>
            <button type="button" onClick={clear} style={ghostBtn}>
              Change
            </button>
          </div>
        </div>
      )}

      <WidgetCard title="Company search" subtitle="Name or ticker, minimum 2 characters">
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ position: "relative" }}>
            <Search
              size={16}
              color="#9ca3af"
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
            />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. RELIANCE or Reliance Industries"
              aria-label="Search for a company by name or ticker"
              autoFocus
              style={{
                width: "100%",
                padding: "10px 12px 10px 36px",
                fontSize: 14,
                color: "#111827",
                border: "1px solid rgba(229,231,235,0.9)",
                borderRadius: 10,
                background: "#ffffff",
              }}
            />
          </div>

          <SearchResults state={state} onPick={pick} />
        </div>
      </WidgetCard>
    </div>
  );
}

function SearchResults({
  state,
  onPick,
}: {
  state: SearchState;
  onPick: (r: StockSearchResult) => void;
}) {
  if (state.status === "idle") {
    return (
      <EmptyState
        message="Start typing to search"
        hint="Enter at least 2 characters of a company name or ticker."
        icon={<Search size={20} />}
      />
    );
  }

  if (state.status === "loading") {
    return <LoadingSkeleton rows={4} />;
  }

  if (state.status === "error") {
    return <ErrorState message="Search unavailable" hint={state.message} />;
  }

  if (state.results.length === 0) {
    return (
      <EmptyState
        message="No matches found"
        hint="Try a different company name or ticker."
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11, color: "#9ca3af", padding: "0 4px" }}>
        Showing {state.results.length} of {state.totalResults} results
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          maxHeight: 320,
          overflowY: "auto",
        }}
      >
        {state.results.map((r) => (
          <button
            key={r.ticker}
            type="button"
            onClick={() => onPick(r)}
            className="result-row"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              textAlign: "left",
              cursor: "pointer",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(229,231,235,0.8)",
              background: "#ffffff",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                {r.ticker || "—"}
                {r.name && (
                  <span style={{ fontWeight: 400, color: "#6b7280" }}> · {r.name}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af" }}>
                {[r.sector, r.country].filter(Boolean).join(" · ") || "No metadata"}
              </div>
            </div>
            <ArrowRight size={16} color="#9ca3af" style={{ flexShrink: 0 }} />
          </button>
        ))}
      </div>
    </div>
  );
}

const primaryBtn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  color: "#ffffff",
  background: "#4f46e5",
  border: "1px solid #4f46e5",
  borderRadius: 8,
  padding: "6px 12px",
} as const;

const ghostBtn = {
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  color: "#4338ca",
  background: "#ffffff",
  border: "1px solid #e0e7ff",
  borderRadius: 8,
  padding: "6px 12px",
} as const;
