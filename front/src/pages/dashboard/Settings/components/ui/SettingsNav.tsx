import type { ReactNode } from "react";
import { icons } from "./SettingsIcons";

interface NavItem {
  id: string;
  icon: ReactNode;
  label: string;
  badge?: number;
}

interface SettingsNavProps {
  sectionLabel: string;
  navItems: NavItem[];
  activeSection: string;
  onSelect: (id: string) => void;
  logoutLabel: string;
  onLogout: () => void;
}

export default function SettingsNav({ sectionLabel, navItems, activeSection, onSelect, logoutLabel, onLogout }: SettingsNavProps) {
  return (
    <aside style={{
      width: "clamp(224px, 18vw, 260px)",
      height: "100%",
      background: "transparent",
      borderRight: "1px solid rgba(26,26,26,0.06)",
      padding: "24px 16px",
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      boxSizing: "border-box",
      flexShrink: 0,
      overflowY: "auto",
    }}>
      <div style={{ padding: "0 10px", marginBottom: "20px", fontSize: "11px", fontWeight: 800, color: "#999999", textTransform: "uppercase", letterSpacing: "1px" }}>
        {sectionLabel}
      </div>

      {navItems.map((item) => {
        const active = activeSection === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            style={{
              display: "flex", alignItems: "center", gap: "12px",
              width: "100%", padding: "12px 14px", borderRadius: "12px",
              background: active ? "#FFFFFF" : "transparent",
              border: active ? "1px solid rgba(26,26,26,0.04)" : "1px solid transparent",
              color: active ? "#1A1A1A" : "#666666",
              fontSize: "14px", fontWeight: active ? 800 : 600, cursor: "pointer",
              transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
              textAlign: "left",
              boxShadow: active ? "0 4px 12px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02)" : "none",
            }}
            onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = "rgba(26,26,26,0.03)"; e.currentTarget.style.color = "#1A1A1A"; } }}
            onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#666666"; } }}
          >
            <div style={{ color: active ? "#F9A08B" : "#999999", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {item.icon}
            </div>
            <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {item.label}
            </span>
            {item.badge && (
              <span style={{ background: active ? "#F9A08B" : "rgba(26,26,26,0.06)", color: active ? "#FFF" : "#1A1A1A", fontSize: "11px", fontWeight: 800, padding: "2px 8px", borderRadius: "20px" }}>
                {item.badge}
              </span>
            )}
          </button>
        );
      })}

      <div style={{ marginTop: "auto", paddingTop: "20px", borderTop: "1px solid rgba(26,26,26,0.06)", padding: "20px 0 0" }}>
        <button
          onClick={onLogout}
          style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", padding: "12px 14px", borderRadius: "12px", background: "transparent", border: "1px solid transparent", color: "#D88C9A", fontSize: "14px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s ease", textAlign: "left" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(216,140,154,0.08)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>{icons.logout}</div>
          {logoutLabel}
        </button>
      </div>
    </aside>
  );
}
