import { useState } from "react";

/** Столько же, сколько держит колонка `studio_members.bio`. */
const STAFF_BIO_MAX = 600;

/**
 * «О себе» мастера — текст для клиентов мини-приложения («Подробнее» у
 * занятия и при записи). Поле многострочное и растёт за текстом: абзац в одну
 * строку инпута владелец не перечитает. Счётчик появляется ближе к пределу —
 * раньше он только отвлекает.
 */
export default function StaffBioField({ value, onChange, placeholder, hint }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  hint: string;
}) {
  const [focused, setFocused] = useState(false);
  const left = STAFF_BIO_MAX - value.length;

  return (
    <div>
      <textarea
        value={value}
        maxLength={STAFF_BIO_MAX}
        rows={3}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%", padding: "11px 14px", minHeight: "88px", resize: "vertical",
          fieldSizing: "content", maxHeight: "220px",
          background: focused ? "var(--bg-card)" : "rgba(var(--ink),0.025)",
          border: focused ? "1.5px solid #FCAE91" : "1.5px solid rgba(var(--ink),0.09)",
          borderRadius: "12px", fontSize: "14px", fontWeight: 500, lineHeight: 1.55, color: "var(--onyx)",
          outline: "none", fontFamily: "Manrope, sans-serif",
          boxShadow: focused ? "0 0 0 3px rgba(252,174,145,0.14)" : "none",
          transition: "all 0.18s ease", boxSizing: "border-box",
        } as React.CSSProperties}
      />
      <div style={{ display: "flex", gap: "12px", justifyContent: "space-between", marginTop: "6px" }}>
        <p style={{ fontSize: "11px", color: "#AAAAAA", margin: 0, fontWeight: 500, lineHeight: 1.5 }}>{hint}</p>
        {left <= 100 && (
          <span style={{ fontSize: "11px", fontWeight: 700, color: left <= 20 ? "#D88C9A" : "#AAAAAA", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
            {left}
          </span>
        )}
      </div>
    </div>
  );
}
