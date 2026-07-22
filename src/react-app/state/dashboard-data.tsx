// Central dashboard data store.
//
// Owns the three independent fetch states (pattern, holders, insider) for the
// selected company, plus a refresh action, the "refreshing" flag, the
// last-refreshed timestamp, and a little shared UI selection (active holders tab
// + insider sort) so the header actions, the snapshot handler, the source
// footer, and the cards all read one live source of truth.
//
// The four cards fetch independently — one failing never blanks the others.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { HolderCategory } from "@shared/types";
import {
  getInsiderDisclosures,
  getShareholdingHistory,
  getShareholdingHolders,
  getShareholdingPattern,
} from "@/lib/api";
import {
  isIndiaCountry,
  type HoldersState,
  type InsiderState,
  type PatternState,
  type ShareholdingHistoryCardState,
} from "@/components/shareholding/common";
import { useSelectedCompany } from "@/state/selected-company";

export interface InsiderSort {
  key: "date" | "quantity";
  desc: boolean;
}

interface DashboardData {
  patternState: PatternState;
  holdersState: HoldersState;
  insiderState: InsiderState;
  historyState: ShareholdingHistoryCardState;
  isRefreshing: boolean;
  lastRefreshed: string | null; // ISO
  refresh: () => void;
  /** True once at least one section has loaded (enables Export). */
  hasAnyData: boolean;
  // Shared UI selection (controlled by the cards, read by the snapshot handler).
  holdersTab: HolderCategory;
  setHoldersTab: (t: HolderCategory) => void;
  insiderSort: InsiderSort;
  setInsiderSort: (s: InsiderSort) => void;
}

const DashboardDataContext = createContext<DashboardData | null>(null);

const LOADING = { status: "loading" } as const;

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const { company } = useSelectedCompany();

  const [patternState, setPatternState] = useState<PatternState>(LOADING);
  const [holdersState, setHoldersState] = useState<HoldersState>(LOADING);
  const [insiderState, setInsiderState] = useState<InsiderState>(LOADING);
  const [historyState, setHistoryState] = useState<ShareholdingHistoryCardState>(LOADING);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [holdersTab, setHoldersTab] = useState<HolderCategory>("promoter");
  const [insiderSort, setInsiderSort] = useState<InsiderSort>({ key: "date", desc: true });

  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!company) {
      setPatternState(LOADING);
      setHoldersState(LOADING);
      setInsiderState(LOADING);
      setHistoryState(LOADING);
      lastKeyRef.current = null;
      return;
    }

    const key = `${company.ticker}|${company.name}`;
    // Same company + a new nonce => this run is a Refresh (keep prior data).
    const isRefresh = key === lastKeyRef.current;
    lastKeyRef.current = key;

    // Non-Indian companies aren't on BSE — every card shows the same empty state.
    if (company.country && !isIndiaCountry(company.country)) {
      setPatternState({ status: "unavailable" });
      setHoldersState({ status: "unavailable" });
      setInsiderState({ status: "unavailable" });
      setHistoryState({ status: "unavailable" });
      setLastRefreshed(new Date().toISOString());
      return;
    }

    if (isRefresh) {
      setIsRefreshing(true); // keep current data visible while re-fetching
    } else {
      setPatternState(LOADING);
      setHoldersState(LOADING);
      setInsiderState(LOADING);
      setHistoryState(LOADING);
    }

    const controller = new AbortController();
    const req = { query: company.name || company.ticker, ticker: company.ticker, name: company.name };

    const pPattern = (async () => {
      try {
        const res = await getShareholdingPattern(req, controller.signal);
        if (controller.signal.aborted) return;
        if (res.ok) setPatternState({ status: "done", pattern: res });
        else if (res.code === "not_found") setPatternState({ status: "unavailable" });
        else setPatternState({ status: "error", message: res.message });
      } catch {
        /* aborted */
      }
    })();

    const pHolders = (async () => {
      try {
        const res = await getShareholdingHolders(req, controller.signal);
        if (controller.signal.aborted) return;
        if (res.ok) setHoldersState({ status: "done", holders: res });
        else if (res.code === "not_found") setHoldersState({ status: "unavailable" });
        else setHoldersState({ status: "error", message: res.message });
      } catch {
        /* aborted */
      }
    })();

    const pInsider = (async () => {
      try {
        const res = await getInsiderDisclosures(
          { ticker: company.ticker, country: company.country, name: company.name },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (res.ok) setInsiderState({ status: "done", insider: res });
        else if (res.code === "not_found") setInsiderState({ status: "unavailable" });
        else setInsiderState({ status: "error", message: res.message });
      } catch {
        /* aborted */
      }
    })();

    const pHistory = (async () => {
      try {
        const res = await getShareholdingHistory(
          { ticker: company.ticker, country: company.country, name: company.name },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (res.ok) setHistoryState({ status: "done", history: res });
        else if (res.code === "not_found") setHistoryState({ status: "unavailable" });
        else setHistoryState({ status: "error", message: res.message });
      } catch {
        /* aborted */
      }
    })();

    Promise.allSettled([pPattern, pHolders, pInsider, pHistory]).then(() => {
      if (controller.signal.aborted) return;
      setIsRefreshing(false);
      setLastRefreshed(new Date().toISOString());
    });

    return () => controller.abort();
  }, [company, refreshNonce]);

  const value = useMemo<DashboardData>(() => {
    const hasAnyData =
      patternState.status === "done" ||
      holdersState.status === "done" ||
      insiderState.status === "done" ||
      historyState.status === "done";
    return {
      patternState,
      holdersState,
      insiderState,
      historyState,
      isRefreshing,
      lastRefreshed,
      refresh: () => setRefreshNonce((n) => n + 1),
      hasAnyData,
      holdersTab,
      setHoldersTab,
      insiderSort,
      setInsiderSort,
    };
  }, [
    patternState,
    holdersState,
    insiderState,
    historyState,
    isRefreshing,
    lastRefreshed,
    holdersTab,
    insiderSort,
  ]);

  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>;
}

export function useDashboardData(): DashboardData {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) throw new Error("useDashboardData must be used within a DashboardDataProvider");
  return ctx;
}
