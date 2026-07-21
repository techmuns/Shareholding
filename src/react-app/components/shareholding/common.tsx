// Shared helpers for the shareholding cards: the fetch-state type, a state gate
// that renders loading/empty/error uniformly, and the source/freshness line.
import type { ReactNode } from "react";
import { Landmark } from "lucide-react";
import type { HoldersSuccess, ShareholdingPatternSuccess } from "@shared/types";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/ui/states";

/** The non-`done` phases shared by every BSE-backed card. */
type NonDoneStatus =
  | { status: "loading" }
  | { status: "unavailable" } // not_found or a non-Indian (non-BSE) company
  | { status: "error"; message: string };

/** Shared state for the pattern-backed cards (fetched once at the page level). */
export type PatternState = NonDoneStatus | { status: "done"; pattern: ShareholdingPatternSuccess };

/** State for the individual-holders card (its own fetch). */
export type HoldersState = NonDoneStatus | { status: "done"; holders: HoldersSuccess };

/** Treat empty/unknown as India (so we still try); only skip clearly non-Indian. */
export function isIndiaCountry(country: string): boolean {
  const c = country.trim().toLowerCase();
  return c === "" || c === "india" || c === "in" || c === "ind" || c === "bharat";
}

/** Render a card's non-`done` phase (loading/unavailable/error), else null. */
function NonDoneView({ state, loadingRows }: { state: NonDoneStatus; loadingRows: number }) {
  if (state.status === "loading") return <LoadingSkeleton rows={loadingRows} />;
  if (state.status === "unavailable") {
    return (
      <EmptyState
        message="BSE shareholding data is not available for this company."
        hint="BSE coverage is limited to Indian (BSE-listed) companies."
        icon={<Landmark size={20} />}
      />
    );
  }
  return <ErrorState message="Couldn't load shareholding data" hint={state.message} />;
}

/** Render the non-`done` states; otherwise hand the pattern to `children`. */
export function CardStateGate({
  state,
  loadingRows = 4,
  children,
}: {
  state: PatternState;
  loadingRows?: number;
  children: (pattern: ShareholdingPatternSuccess) => ReactNode;
}) {
  if (state.status !== "done") return <NonDoneView state={state} loadingRows={loadingRows} />;
  return <>{children(state.pattern)}</>;
}

/** Same gate, for the individual-holders card. */
export function HoldersStateGate({
  state,
  loadingRows = 6,
  children,
}: {
  state: HoldersState;
  loadingRows?: number;
  children: (holders: HoldersSuccess) => ReactNode;
}) {
  if (state.status !== "done") return <NonDoneView state={state} loadingRows={loadingRows} />;
  return <>{children(state.holders)}</>;
}

function formatAsOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "As of <timestamp> · Source: BSE India" — meets the source/freshness standard. */
export function SourceLine({ asOf, partial }: { asOf: string; partial?: boolean }) {
  const when = formatAsOf(asOf);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        flexWrap: "wrap",
        padding: "8px 16px",
        borderTop: "1px solid rgba(229,231,235,0.8)",
        fontSize: 11,
        color: "#9ca3af",
      }}
    >
      <span>{when ? `As of ${when} · Source: BSE India` : "Source: BSE India"}</span>
      {partial && <span style={{ color: "#d97706" }}>Some figures may be partial</span>}
    </div>
  );
}
