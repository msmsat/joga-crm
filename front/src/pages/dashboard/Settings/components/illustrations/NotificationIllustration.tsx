import { useState, useEffect } from "react";
import { icons } from "../ui/SettingsIcons";

export default function NotificationIllustration() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % 4), 1400);
    return () => clearInterval(t);
  }, []);
  const notifs = [
    { icon: icons.mail, text: "Новая запись от Анны К.", color: "var(--peach)" },
    { icon: icons.bell, text: "Оплата подтверждена", color: "#A3C9A8" },
    { icon: icons.smartphone, text: "Push: Напоминание о визите", color: "#9BB5D8" },
  ];
  return (
    <div style={{ padding: "12px 0 4px", display: "flex", flexDirection: "column", gap: "8px" }}>
      {notifs.map((n, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "10px 14px", borderRadius: "10px",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          transform: step === i ? "translateX(4px)" : "none",
          opacity: step === i ? 1 : 0.55,
          transition: "all 0.35s ease",
          boxShadow: step === i ? "0 4px 16px rgba(0,0,0,0.06)" : "none",
        }}>
          <div style={{
            width: "28px", height: "28px", borderRadius: "8px",
            background: `${n.color}20`, color: n.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>{n.icon}</div>
          <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--onyx)" }}>{n.text}</div>
          <div style={{
            marginLeft: "auto", width: "6px", height: "6px", borderRadius: "50%",
            background: n.color, flexShrink: 0,
            opacity: step === i ? 1 : 0,
          }} />
        </div>
      ))}
    </div>
  );
}
