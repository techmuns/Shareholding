// Shared widget states: loading shimmer, empty, and error.
// Every data widget must implement all three.
import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";

const centered = {
  minHeight: 160,
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center" as const,
  gap: 8,
  padding: 24,
};

/** Shimmer skeleton — never a raw spinner. */
export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="shimmer"
          style={{ height: 14, width: `${90 - i * 12}%`, borderRadius: 6 }}
        />
      ))}
    </div>
  );
}

/** Centered empty state: icon + message + next-step hint. */
export function EmptyState({
  message,
  hint,
  icon,
}: {
  message: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div style={centered}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: "#eef2ff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#4f46e5",
        }}
      >
        {icon ?? <Inbox size={20} />}
      </div>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#374151" }}>{message}</p>
      {hint && <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>{hint}</p>}
    </div>
  );
}

/** Centered, friendly error — never a raw stack trace. */
export function ErrorState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div style={centered}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: "#fef2f2",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#ef4444",
        }}
      >
        <AlertTriangle size={20} />
      </div>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#374151" }}>{message}</p>
      <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>
        {hint ?? "Please try again later."}
      </p>
    </div>
  );
}
