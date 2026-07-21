// Authoritative host-context hook.
//
// Reads `sdk.getContext()` and re-syncs on every `sdk.onMessage`, exposing the
// session (auth), the host-selected ticker, and TradingView symbol. The host
// owns auth — we only READ the token.
import { useEffect, useState } from "react";
import { sdk } from "@/lib/sdk";

export interface SessionContext {
  token: string | null;
  userName: string | null;
  email: string | null;
  orgId: string | null;
  orgName: string | null;
}

const EMPTY_SESSION: SessionContext = {
  token: null,
  userName: null,
  email: null,
  orgId: null,
  orgName: null,
};

interface HostContextShape {
  session?: Partial<SessionContext>;
  market?: {
    selectedTicker?: string | null;
    selectedTickerCompany?: string | null;
    selectedTickerCountry?: string | null;
    selectedSymbol?: string | null;
  };
}

export interface HostContext {
  session: SessionContext;
  ticker: string | null;
  tickerCompany: string | null;
  tickerCountry: string | null;
  selectedSymbol: string | null;
}

export function useHostContext(): HostContext {
  const [session, setSession] = useState<SessionContext>(EMPTY_SESSION);
  const [ticker, setTicker] = useState<string | null>(null);
  const [tickerCompany, setTickerCompany] = useState<string | null>(null);
  const [tickerCountry, setTickerCountry] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const ctx = sdk.getContext() as HostContextShape | null;
      if (!ctx) return;

      if (ctx.session) {
        setSession({ ...EMPTY_SESSION, ...ctx.session });
      }
      if (ctx.market) {
        setTicker(ctx.market.selectedTicker ?? null);
        setTickerCompany(ctx.market.selectedTickerCompany ?? null);
        setTickerCountry(ctx.market.selectedTickerCountry ?? null);
        setSelectedSymbol(ctx.market.selectedSymbol ?? null);
      }
    };

    sync();
    return sdk.onMessage(sync);
  }, []);

  return { session, ticker, tickerCompany, tickerCountry, selectedSymbol };
}
