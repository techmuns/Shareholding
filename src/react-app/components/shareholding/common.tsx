// Shared helpers for the shareholding cards: the fetch-state type, a state gate
// that renders loading/empty/error uniformly, and the source/freshness line.
import type { ReactNode } from "react";
import { Landmark } from "lucide-react";
import type {
  HoldersSuccess,
  InsiderSuccess,
  ShareholdingHistorySuccess,
  ShareholdingPatternSuccess,
} from "@shared/types";
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

/** State for the insider-disclosures card (its own fetch). */
export type InsiderState = NonDoneStatus | { status: "done"; insider: InsiderSuccess };

/** State for the shareholding-history card (its own fetch). */
export type ShareholdingHistoryCardState =
  | NonDoneStatus
  | { status: "done"; history: ShareholdingHistorySuccess };

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
        message="Shareholding data isn't available for this company."
        hint="This dashboard reads from BSE's main board. NSE-only or NSE SME (Emerge) listings, some recent IPOs, and non-Indian tickers aren't covered."
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

/** Same gate, for the insider-disclosures card. */
export function InsiderStateGate({
  state,
  loadingRows = 6,
  children,
}: {
  state: InsiderState;
  loadingRows?: number;
  children: (insider: InsiderSuccess) => ReactNode;
}) {
  if (state.status !== "done") return <NonDoneView state={state} loadingRows={loadingRows} />;
  return <>{children(state.insider)}</>;
}

/** Same gate, for the shareholding-history card. */
export function ShareholdingHistoryStateGate({
  state,
  loadingRows = 6,
  children,
}: {
  state: ShareholdingHistoryCardState;
  loadingRows?: number;
  children: (history: ShareholdingHistorySuccess) => ReactNode;
}) {
  if (state.status !== "done") return <NonDoneView state={state} loadingRows={loadingRows} />;
  return <>{children(state.history)}</>;
}

export function formatAsOf(iso: string): string {
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

/**
 * The single provenance/freshness line reused across every data card:
 * "<context> · Source: <source> · fetched <timestamp>" with an optional neutral
 * `note` and an optional amber `warn`.
 */
export function SourceLine({
  source,
  context,
  asOf,
  note,
  warn,
}: {
  source: string;
  context?: string;
  asOf: string;
  note?: string;
  warn?: string;
}) {
  const when = formatAsOf(asOf);
  const left = [context, `Source: ${source}`, when ? `fetched ${when}` : "", note]
    .filter(Boolean)
    .join(" · ");
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
      <span>{left}</span>
      {warn && <span style={{ color: "#d97706" }}>{warn}</span>}
    </div>
  );
}
