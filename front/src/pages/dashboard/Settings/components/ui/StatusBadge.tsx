export default function StatusBadge({ type, children }: { type: "active" | "warning" | "info"; children: React.ReactNode }) {
  const colors = {
    active: { bg: "rgba(163,201,168,0.15)", color: "#5A9A65", border: "rgba(163,201,168,0.35)" },
    warning: { bg: "rgba(216,140,154,0.12)", color: "#C0607A", border: "rgba(216,140,154,0.3)" },
    info: { bg: "rgba(252,174,145,0.12)", color: "#C8784A", border: "rgba(252,174,145,0.35)" },
  };
  const c = colors[type];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      padding: "3px 10px", borderRadius: "100px",
      background: c.bg, color: c.color,
      border: `1px solid ${c.border}`,
      fontSize: "11px", fontWeight: 700, letterSpacing: "0.2px",
    }}>
      {children}
    </span>
  );
}
