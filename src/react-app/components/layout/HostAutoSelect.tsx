// Host-context auto-select (real Munshot embedding behavior).
//
// When the Munshot host supplies a selected ticker via the SDK, auto-select that
// company and route to the dashboard — skipping the manual picker. Reacts to host
// ticker CHANGES without a page refresh. When the host provides no ticker, the
// manual picker remains the fallback, and a user's manual "Change" override
// sticks until the host pushes a genuinely new ticker.
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useHostContext } from "@/hooks/useHostContext";
import { useSelectedCompany } from "@/state/selected-company";

export function HostAutoSelect() {
  const { ticker, tickerCompany, tickerCountry } = useHostContext();
  const { select } = useSelectedCompany();
  const navigate = useNavigate();
  const lastHostTicker = useRef<string | null>(null);

  useEffect(() => {
    if (!ticker) return;
    // Only act on a genuinely new host ticker (so a user override isn't clobbered
    // by re-renders, and a real host change re-selects + re-fetches).
    if (ticker === lastHostTicker.current) return;
    lastHostTicker.current = ticker;

    select({
      ticker,
      name: tickerCompany ?? ticker,
      country: tickerCountry ?? "",
      sector: "",
    });
    navigate("/shareholding");
  }, [ticker, tickerCompany, tickerCountry, select, navigate]);

  return null;
}
