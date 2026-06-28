import type { OnboardingData, WorkingDay } from "./types";
import { DAY_NAMES_SHORT } from "./types";

interface Props {
  data: OnboardingData;
  onChange: (patch: Partial<OnboardingData>) => void;
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "12px", fontWeight: 700,
  color: "#666", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "8px",
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: "38px", height: "22px", borderRadius: "11px", border: "none",
        background: checked ? "#FCAE91" : "#E0DDD8",
        cursor: "pointer", padding: "2px", display: "flex",
        alignItems: "center", justifyContent: checked ? "flex-end" : "flex-start",
        transition: "all 0.25s cubic-bezier(0.34,1.1,0.64,1)",
        flexShrink: 0,
        boxShadow: checked ? "0 2px 8px rgba(252,174,145,0.35)" : "none",
      }}
    >
      <div style={{
        width: "16px", height: "16px", borderRadius: "50%",
        background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
      }} />
    </button>
  );
}

function updateWorkingDay(hours: WorkingDay[], idx: number, patch: Partial<WorkingDay>): WorkingDay[] {
  return hours.map((d, i) => i === idx ? { ...d, ...patch } : d);
}

export default function StepSchedule({ data, onChange }: Props) {
  function patchHours(idx: number, patch: Partial<WorkingDay>) {
    onChange({ workingHours: updateWorkingDay(data.workingHours, idx, patch) });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h3 style={{ fontSize: "22px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.8px", margin: "0 0 6px" }}>
          График работы
        </h3>
        <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
          Укажите дни и часы работы вашей студии
        </p>
      </div>

      <div>
        <label style={labelStyle}>Расписание студии</label>
        <div style={{
          background: "white", border: "1.5px solid #EEEBE6",
          borderRadius: "14px", overflow: "hidden",
        }}>
          {data.workingHours.map((day, idx) => (
            <div
              key={day.dayOfWeek}
              style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "11px 16px",
                borderBottom: idx < 6 ? "1px solid #F5F3F0" : "none",
                background: day.isOpen ? "white" : "rgba(26,26,26,0.018)",
                transition: "background 0.2s ease",
              }}
            >
              <span style={{
                width: "26px", fontSize: "12px", fontWeight: 700,
                color: day.isOpen ? "#1A1A1A" : "#BBBBBB",
                flexShrink: 0, transition: "color 0.2s ease",
              }}>
                {DAY_NAMES_SHORT[day.dayOfWeek]}
              </span>

              <Toggle checked={day.isOpen} onChange={v => patchHours(idx, { isOpen: v })} />

              {day.isOpen ? (
                <>
                  <input
                    type="time"
                    value={day.openTime}
                    onChange={e => patchHours(idx, { openTime: e.target.value })}
                    style={{
                      padding: "5px 8px", border: "1.5px solid #EEEBE6",
                      borderRadius: "8px", fontSize: "12px", fontFamily: "inherit",
                      color: "#1A1A1A", background: "rgba(26,26,26,0.02)",
                      outline: "none", cursor: "pointer",
                      transition: "border-color 0.2s ease",
                    }}
                    onFocus={e => (e.target.style.borderColor = "#FCAE91")}
                    onBlur={e => (e.target.style.borderColor = "#EEEBE6")}
                  />
                  <span style={{ fontSize: "11px", color: "#CCCCCC" }}>—</span>
                  <input
                    type="time"
                    value={day.closeTime}
                    onChange={e => patchHours(idx, { closeTime: e.target.value })}
                    style={{
                      padding: "5px 8px", border: "1.5px solid #EEEBE6",
                      borderRadius: "8px", fontSize: "12px", fontFamily: "inherit",
                      color: "#1A1A1A", background: "rgba(26,26,26,0.02)",
                      outline: "none", cursor: "pointer",
                      transition: "border-color 0.2s ease",
                    }}
                    onFocus={e => (e.target.style.borderColor = "#FCAE91")}
                    onBlur={e => (e.target.style.borderColor = "#EEEBE6")}
                  />
                </>
              ) : (
                <span style={{ fontSize: "12px", color: "#CCCCCC", fontStyle: "italic" }}>Выходной</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
