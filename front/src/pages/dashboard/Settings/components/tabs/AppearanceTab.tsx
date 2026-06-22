import { useState } from "react";
import { icons } from "../ui/SettingsIcons";
import SectionHeader from "../ui/SectionHeader";

export default function AppearanceTab() {
  const [themeMode, setThemeMode] = useState<"light" | "dark" | "auto">("light");
  const [accentColor, setAccentColor] = useState("#FCAE91");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.palette} title="Тема оформления" subtitle="Выберите визуальный стиль интерфейса" />
        <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
          {[
            { id: "light", label: "Светлая", icon: icons.sun, preview: ["#FDFCFB", "#FFFFFF", "#FCAE91"] },
            { id: "dark", label: "Тёмная", icon: icons.moon, preview: ["#121212", "#1E1E1E", "#FCAE91"] },
            { id: "auto", label: "Системная", icon: icons.toggle, preview: ["#ECECEC", "#F5F5F5", "#FCAE91"] },
          ].map((t) => {
            const selected = themeMode === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setThemeMode(t.id as "light" | "dark" | "auto")}
                style={{
                  flex: 1, padding: "16px 12px",
                  borderRadius: "12px",
                  border: `1.5px solid ${selected ? "var(--peach)" : "var(--border)"}`,
                  background: selected ? "rgba(252,174,145,0.07)" : "transparent",
                  cursor: "pointer",
                  transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: "10px",
                  outline: "none"
                }}
                onMouseOver={(e) => {
                  if (!selected) {
                    e.currentTarget.style.borderColor = "rgba(252,174,145,0.4)";
                    e.currentTarget.style.background = "rgba(0,0,0,0.02)";
                  }
                }}
                onMouseOut={(e) => {
                  if (!selected) {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.background = "transparent";
                  }
                }}
              >
                <div style={{ display: "flex", gap: "4px" }}>
                  {t.preview.map((c, i) => (
                    <div key={i} style={{
                      width: i === 2 ? "12px" : "20px", height: "24px",
                      borderRadius: "4px", background: c,
                      border: "1px solid rgba(0,0,0,0.06)",
                    }} />
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "5px", color: selected ? "var(--peach)" : "var(--muted)" }}>
                  {t.icon}
                  <span style={{ fontSize: "12px", fontWeight: 600 }}>{t.label}</span>
                </div>
                <div style={{
                  width: "18px", height: "18px", borderRadius: "50%",
                  background: selected ? "var(--peach)" : "transparent",
                  border: selected ? "none" : "1.5px solid var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "white",
                  transition: "all 0.2s ease"
                }}>
                  {selected && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "csCheckPop 0.2s cubic-bezier(0.34, 1.5, 0.64, 1)" }}>
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.zap} title="Акцентный цвет" subtitle="Персонализируйте главный цвет интерфейса" />
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
          {[
            { color: "#FCAE91", label: "Персиковый" },
            { color: "#A3C9A8", label: "Фисташковый" },
            { color: "#9BB5D8", label: "Лавандовый" },
            { color: "#D88C9A", label: "Розовый" },
            { color: "#E8C97A", label: "Золотой" },
            { color: "#8BBFBF", label: "Минт" },
          ].map((c, i) => {
            const isSelected = c.color === accentColor;
            return (
              <button
                key={i}
                title={c.label}
                onClick={() => setAccentColor(c.color)}
                style={{
                  width: "36px", height: "36px", borderRadius: "10px",
                  background: c.color,
                  border: isSelected ? `3px solid ${c.color}` : "3px solid transparent",
                  outline: isSelected ? `2px solid white` : "none",
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "white",
                  transition: "all 0.25s cubic-bezier(0.34, 1.5, 0.64, 1)",
                  transform: isSelected ? "scale(1.12)" : "scale(1)",
                  boxShadow: isSelected
                    ? `0 0 0 2px ${c.color}, 0 8px 24px ${c.color}60`
                    : `0 4px 12px ${c.color}25`,
                }}
                onMouseOver={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.transform = "scale(1.15)";
                    e.currentTarget.style.boxShadow = `0 6px 16px ${c.color}40`;
                  }
                }}
                onMouseOut={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.boxShadow = `0 4px 12px ${c.color}25`;
                  }
                }}
              >
                {isSelected && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "csCheckPop 0.2s cubic-bezier(0.34, 1.5, 0.64, 1)" }}>
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                )}
              </button>
            );
          })}
        </div>
        <div style={{
          padding: "14px 16px",
          background: "rgba(252,174,145,0.06)", borderRadius: "10px",
          border: "1px solid rgba(252,174,145,0.2)",
          fontSize: "12px", color: "var(--muted)",
        }}>
          Цвет акцента применяется к кнопкам, ссылкам, активным элементам и прогресс-индикаторам.
        </div>
      </div>
    </div>
  );
}
