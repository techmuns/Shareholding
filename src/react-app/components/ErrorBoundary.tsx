// Top-level error boundary. If any child throws during render, we still paint the
// dashboard shell chrome + a friendly recovery message instead of a blank page.
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    try {
      console.error("[ErrorBoundary] render error:", error, info.componentStack);
    } catch {
      /* ignore */
    }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

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
        <header
          style={{
            display: "flex",
            alignItems: "center",
            padding: "0 24px",
            height: 48,
            background: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(8px)",
            borderBottom: "1px solid #e5e7eb",
            flexShrink: 0,
          }}
        >
          <h1 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>Shareholding</h1>
        </header>
        <main
          style={{
            flex: 1,
            overflow: "auto",
            padding: "24px 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              maxWidth: 420,
              textAlign: "center",
              background: "rgba(255,255,255,0.9)",
              border: "1px solid rgba(229,231,235,0.8)",
              borderRadius: 16,
              padding: 28,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827" }}>
              Something went wrong
            </h2>
            <p style={{ margin: "8px 0 20px", fontSize: 13, color: "#6b7280" }}>
              The dashboard hit an unexpected error. Reloading should bring you back to the company
              search.
            </p>
            <button
              type="button"
              onClick={() => window.location.assign("/")}
              style={{
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                color: "#ffffff",
                background: "#4f46e5",
                border: "1px solid #4f46e5",
                borderRadius: 8,
                padding: "8px 16px",
              }}
            >
              Reload dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }
}
