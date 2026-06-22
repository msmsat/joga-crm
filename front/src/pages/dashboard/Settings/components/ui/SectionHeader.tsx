export default function SectionHeader({ icon, title, subtitle, accent }: { icon: React.ReactNode; title: string; subtitle: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "28px" }}>
      <div style={{
        width: "40px", height: "40px",
        borderRadius: "12px",
        background: accent ? "var(--peach)" : "rgba(252,174,145,0.12)",
        color: accent ? "white" : "var(--peach)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--onyx)", letterSpacing: "-0.3px" }}>{title}</div>
        <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "1px" }}>{subtitle}</div>
      </div>
    </div>
  );
}
