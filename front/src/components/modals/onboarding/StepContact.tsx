import { InputField, PhoneField } from "../../UI";
import type { OnboardingData } from "./types";

interface Props {
  data: OnboardingData;
  onChange: (patch: Partial<OnboardingData>) => void;
  phoneError?: string | null;
  isCheckingPhone?: boolean;
}

const IconPin = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.75 4.5 8.5 4.5 8.5S12.5 9.75 12.5 6c0-2.485-2.015-4.5-4.5-4.5z" stroke="currentColor" strokeWidth="1.4"/>
    <circle cx="8" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
  </svg>
);

const IconEmail = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="3.5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M1.5 5.5L8 9.5L14.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

const IconGlobe = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M8 2C8 2 6 5 6 8C6 11 8 14 8 14" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M8 2C8 2 10 5 10 8C10 11 8 14 8 14" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M2 8h12" stroke="currentColor" strokeWidth="1.2"/>
  </svg>
);

export default function StepContact({ data, onChange, phoneError, isCheckingPhone }: Props) {
  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h3 style={{ fontSize: "24px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.8px", margin: "0 0 8px" }}>
          Контактные данные
        </h3>
        <p style={{ fontSize: "13px", color: "#888", margin: 0, lineHeight: "1.6" }}>
          Клиенты увидят эту информацию при записи онлайн
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <PhoneField
          label="Телефон студии"
          value={data.phone}
          onChange={(v: string) => onChange({ phone: v || "" })}
        />
        {isCheckingPhone && (
          <div style={{ fontSize: "12px", color: "#AAAAAA", marginTop: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
            <span className="spinner" style={{ width: "10px", height: "10px", borderWidth: "1.5px", borderTopColor: "#FCAE91", flexShrink: 0 }} />
            Проверяем номер...
          </div>
        )}
        {phoneError && !isCheckingPhone && (
          <div style={{ fontSize: "12px", color: "#D88C9A", marginTop: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="6" cy="6" r="5" stroke="#D88C9A" strokeWidth="1.2"/>
              <path d="M6 3.5V6.5" stroke="#D88C9A" strokeWidth="1.2" strokeLinecap="round"/>
              <circle cx="6" cy="8.5" r="0.6" fill="#D88C9A"/>
            </svg>
            {phoneError}
          </div>
        )}

        <InputField
          label="Адрес"
          placeholder="ул. Ленина, д. 10, офис 205"
          value={data.address}
          onChange={(v: string) => onChange({ address: v })}
          icon={<IconPin />}
        />

        <InputField
          label="Email"
          type="email"
          placeholder="studio@example.com"
          value={data.email}
          onChange={(v: string) => onChange({ email: v })}
          icon={<IconEmail />}
        />

        <InputField
          label="Сайт"
          placeholder="https://your-studio.ru"
          value={data.website}
          onChange={(v: string) => onChange({ website: v })}
          icon={<IconGlobe />}
        />
      </div>

      <div style={{
        marginTop: "20px", padding: "12px 14px",
        background: "rgba(163,201,168,0.08)", borderRadius: "12px",
        border: "1px solid rgba(163,201,168,0.2)",
        display: "flex", alignItems: "flex-start", gap: "10px",
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginTop: "1px", flexShrink: 0 }}>
          <circle cx="8" cy="8" r="6.5" stroke="#A3C9A8" strokeWidth="1.3"/>
          <path d="M8 5V8.5" stroke="#A3C9A8" strokeWidth="1.3" strokeLinecap="round"/>
          <circle cx="8" cy="11" r="0.75" fill="#A3C9A8"/>
        </svg>
        <span style={{ fontSize: "12px", color: "#666", lineHeight: "1.5" }}>
          Все поля, кроме телефона, необязательны. Их можно заполнить позже в настройках.
        </span>
      </div>
    </div>
  );
}
