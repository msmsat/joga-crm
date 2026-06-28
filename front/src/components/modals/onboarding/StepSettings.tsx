import { PremiumSelect, TIMEZONES, LANGUAGES, CURRENCIES, DATE_FORMATS, WEEK_START_OPTIONS } from "../../UI";
import type { OnboardingData } from "./types";

interface Props {
  data: OnboardingData;
  onChange: (patch: Partial<OnboardingData>) => void;
}

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "12px", fontWeight: 700,
  color: "#666", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "8px",
};

export default function StepSettings({ data, onChange }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h3 style={{ fontSize: "22px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.8px", margin: "0 0 6px" }}>
          Настройки региона
        </h3>
        <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
          Можно изменить позже в настройках студии
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
        <div>
          <label style={labelStyle}>Часовой пояс</label>
          <PremiumSelect
            value={data.timezone}
            onChange={v => onChange({ timezone: v })}
            options={TIMEZONES}
            placeholder="Выберите пояс"
          />
        </div>
        <div>
          <label style={labelStyle}>Язык</label>
          <PremiumSelect
            value={data.language}
            onChange={v => onChange({ language: v })}
            options={LANGUAGES}
            placeholder="Язык"
          />
        </div>
        <div>
          <label style={labelStyle}>Валюта</label>
          <PremiumSelect
            value={data.currency}
            onChange={v => onChange({ currency: v })}
            options={CURRENCIES}
            placeholder="Валюта"
          />
        </div>
        <div>
          <label style={labelStyle}>Формат даты</label>
          <PremiumSelect
            value={data.dateFormat}
            onChange={v => onChange({ dateFormat: v })}
            options={DATE_FORMATS}
            placeholder="Формат"
          />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Первый день недели</label>
        <div style={{ display: "flex", gap: "8px" }}>
          {WEEK_START_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ firstDayOfWeek: opt.value })}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: "10px",
                border: data.firstDayOfWeek === opt.value ? "1.5px solid #FCAE91" : "1.5px solid #EEEBE6",
                background: data.firstDayOfWeek === opt.value ? "rgba(252,174,145,0.1)" : "white",
                fontSize: "13px", fontWeight: data.firstDayOfWeek === opt.value ? 700 : 500,
                color: data.firstDayOfWeek === opt.value ? "#1A1A1A" : "#888",
                cursor: "pointer", fontFamily: "inherit",
                transition: "all 0.2s ease",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
