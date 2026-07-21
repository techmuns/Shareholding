// App-local "selected company" context.
//
// This is the company the user picks on the home selector screen. It is distinct
// from the host's `selectedTicker` (which the host controls); this dashboard
// drives its own company selection.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SelectedCompany } from "@shared/types";
import { sdk } from "@/lib/sdk";

interface SelectedCompanyContextValue {
  company: SelectedCompany | null;
  select: (company: SelectedCompany) => void;
  clear: () => void;
}

const SelectedCompanyContext = createContext<SelectedCompanyContextValue | null>(null);

export function SelectedCompanyProvider({ children }: { children: ReactNode }) {
  const [company, setCompany] = useState<SelectedCompany | null>(null);

  // Publishing on select covers both paths (manual picker and host auto-select),
  // per the SDK communication standards (namespaced topic).
  const select = useCallback((c: SelectedCompany) => {
    setCompany(c);
    sdk.publish("shareholding.company.select", { ticker: c.ticker, name: c.name });
  }, []);

  const value = useMemo<SelectedCompanyContextValue>(
    () => ({
      company,
      select,
      clear: () => setCompany(null),
    }),
    [company, select],
  );

  return (
    <SelectedCompanyContext.Provider value={value}>
      {children}
    </SelectedCompanyContext.Provider>
  );
}

export function useSelectedCompany(): SelectedCompanyContextValue {
  const ctx = useContext(SelectedCompanyContext);
  if (!ctx) {
    throw new Error("useSelectedCompany must be used within a SelectedCompanyProvider");
  }
  return ctx;
}
