// The mandatory Munshot 3-zone shell.
//  Zone 1: sticky header (Header component)
//  Zone 2: the only scrolling area (main), also the visual-capture target
// The page/root never scrolls — only Zone 2 does.
import type { ReactNode } from "react";
import { Header } from "./Header";

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        background: "linear-gradient(to bottom, rgba(249,250,251,0.8), #ffffff)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#111827",
      }}
    >
      <Header />
      <main
        id="dashboard-main"
        data-dashboard-capture-root="true"
        style={{ flex: 1, overflow: "auto", padding: "24px 32px" }}
      >
        {children}
      </main>
    </div>
  );
}
