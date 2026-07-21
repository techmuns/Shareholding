// The single card structure used for every data widget (Munshot standard).
import type { CSSProperties, ReactNode } from "react";

interface WidgetCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Optional extra style on the card outer element (e.g. gridColumn span). */
  style?: CSSProperties;
  /** Span two grid columns on wide screens, collapsing to one when narrow. */
  wide?: boolean;
  /** Optional element rendered at the right of the header (badge, action). */
  headerRight?: ReactNode;
}

export function WidgetCard({ title, subtitle, children, style, wide, headerRight }: WidgetCardProps) {
  return (
    <div
      className={wide ? "widget-card dash-wide" : "widget-card"}
      style={{
        background: "rgba(255, 255, 255, 0.9)",
        border: "1px solid rgba(229, 231, 235, 0.8)",
        borderRadius: 16,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        backdropFilter: "blur(8px)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 16px",
          borderBottom: "1px solid rgba(229, 231, 235, 0.8)",
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(8px)",
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#111827" }}>{title}</h3>
          {subtitle && (
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9ca3af", lineHeight: 1.3 }}>
              {subtitle}
            </p>
          )}
        </div>
        {headerRight}
      </div>
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          background: "rgba(249,250,251,0.5)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
