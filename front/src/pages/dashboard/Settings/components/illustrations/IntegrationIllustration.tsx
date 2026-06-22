import { useState } from "react";

export default function IntegrationIllustration() {
  const logos = [
    { name: "WhatsApp", color: "#25D366" },
    { name: "Telegram", color: "#229ED9" },
    { name: "Instagram", color: "#E1306C" },
    { name: "1С", color: "#EF3B2C" },
  ];
  const [active, setActive] = useState<number | null>(null);
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: "12px", padding: "16px 0",
    }}>
      <div style={{
        width: "44px", height: "44px", borderRadius: "12px",
        background: "linear-gradient(135deg, var(--peach), #f0876a)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 16px rgba(252,174,145,0.4)",
        flexShrink: 0,
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {logos.map((l, i) => (
          <div key={i} style={{
            height: "2px", width: active === i ? "60px" : "40px",
            background: `linear-gradient(90deg, var(--peach), ${l.color})`,
            borderRadius: "2px", opacity: active === i ? 1 : 0.35,
            transition: "all 0.25s ease",
          }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        {logos.map((l, i) => (
          <div
            key={i}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            style={{
              width: "36px", height: "36px", borderRadius: "10px",
              background: `${l.color}18`,
              border: `1.5px solid ${l.color}35`,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              transform: active === i ? "scale(1.1)" : "scale(1)",
              transition: "transform 0.2s ease",
            }}
          >
            <span style={{ fontSize: "10px", fontWeight: 800, color: l.color }}>{l.name.slice(0, 2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
