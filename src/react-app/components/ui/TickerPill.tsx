// Indigo ticker pill shown in the header when a company is selected.

export function TickerPill({ ticker, company }: { ticker: string; company?: string | null }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 10px",
        background: "#eef2ff",
        color: "#4338ca",
        borderRadius: 99,
        fontSize: 12,
        fontWeight: 600,
        border: "1px solid #e0e7ff",
        maxWidth: 360,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          background: "#6366f1",
          borderRadius: "50%",
          flexShrink: 0,
        }}
      />
      {ticker}
      {company && (
        <span
          style={{
            color: "#818cf8",
            fontWeight: 400,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          — {company}
        </span>
      )}
    </span>
  );
}
