import { ACTIVITY_TYPES } from "../../UI";
import type { OnboardingData } from "./types";

interface Props {
  data: OnboardingData;
  onChange: (patch: Partial<OnboardingData>) => void;
}

export default function StepActivity({ data, onChange }: Props) {
  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h3 style={{ fontSize: "24px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.8px", margin: "0 0 8px" }}>
          Вид деятельности
        </h3>
        <p style={{ fontSize: "13px", color: "#888", margin: 0, lineHeight: "1.6" }}>
          Выберите направление — мы настроим CRM под вас
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {ACTIVITY_TYPES.map((activity) => {
          const isSelected = data.activityType === activity.id;
          return (
            <button
              key={activity.id}
              type="button"
              onClick={() => onChange({ activityType: activity.id })}
              style={{
                display: "flex", alignItems: "center", gap: "18px",
                padding: "20px 22px", textAlign: "left", fontFamily: "inherit",
                background: isSelected ? "rgba(252,174,145,0.08)" : "white",
                border: isSelected ? "2px solid #FCAE91" : "2px solid #EEEBE6",
                borderRadius: "16px", cursor: "pointer", width: "100%",
                transition: "all 0.25s cubic-bezier(0.34,1.1,0.64,1)",
                boxShadow: isSelected ? "0 8px 24px -4px rgba(252,174,145,0.2)" : "none",
              }}
              onMouseEnter={e => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = "rgba(252,174,145,0.5)";
                  e.currentTarget.style.background = "rgba(252,174,145,0.04)";
                }
              }}
              onMouseLeave={e => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = "#EEEBE6";
                  e.currentTarget.style.background = "white";
                }
              }}
            >
              <div style={{
                width: "56px", height: "56px", borderRadius: "16px", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isSelected ? "rgba(252,174,145,0.15)" : "rgba(26,26,26,0.04)",
                color: isSelected ? "#F9A08B" : "#AAAAAA",
                transition: "all 0.25s cubic-bezier(0.34,1.1,0.64,1)",
              }}>
                {activity.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: "16px", fontWeight: 800, color: isSelected ? "#1A1A1A" : "#444",
                  letterSpacing: "-0.3px", marginBottom: "3px",
                }}>
                  {activity.label}
                </div>
                <div style={{ fontSize: "13px", color: "#AAAAAA", lineHeight: "1.4" }}>
                  {activity.description}
                </div>
              </div>
              <div style={{
                width: "22px", height: "22px", borderRadius: "50%", flexShrink: 0,
                background: isSelected ? "#FCAE91" : "transparent",
                border: isSelected ? "2px solid #FCAE91" : "2px solid #DDDDDD",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.25s cubic-bezier(0.34,1.1,0.64,1)",
              }}>
                {isSelected && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p style={{ fontSize: "12px", color: "#CCCCCC", marginTop: "20px", textAlign: "center" }}>
        Скоро: барбершоп, фитнес, танцы и другие направления
      </p>
    </div>
  );
}
