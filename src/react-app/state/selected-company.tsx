// App-local "selected company" context.
//
// This is the company the user picks on the home selector screen. It is distinct
// from the host's `selectedTicker` (which the host controls); this dashboard
// drives its own company selection.
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SelectedCompany } from "@shared/types";

interface SelectedCompanyContextValue {
  company: SelectedCompany | null;
  select: (company: SelectedCompany) => void;
  clear: () => void;
}

const SelectedCompanyContext = createContext<SelectedCompanyContextValue | null>(null);

export function SelectedCompanyProvider({ children }: { children: ReactNode }) {
  const [company, setCompany] = useState<SelectedCompany | null>(null);

  const value = useMemo<SelectedCompanyContextValue>(
    () => ({
      company,
      select: setCompany,
      clear: () => setCompany(null),
    }),
    [company],
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
