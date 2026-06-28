import React, { useRef } from "react";
import { InputField } from "../../UI";
import type { OnboardingData } from "./types";

interface Props {
  data: OnboardingData;
  onChange: (patch: Partial<OnboardingData>) => void;
}

export default function StepIdentity({ data, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      onChange({ logoFile: file, logoPreviewUrl: ev.target?.result as string });
    };
    reader.readAsDataURL(file);
  }

  const initials = data.studioName.trim().charAt(0).toUpperCase() || "S";

  return (
    <div>
      <div style={{ marginBottom: "28px" }}>
        <h3 style={{ fontSize: "26px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-1px", margin: "0 0 8px" }}>
          Добро пожаловать
        </h3>
        <p style={{ fontSize: "14px", color: "#888", margin: 0, lineHeight: "1.6" }}>
          Пара минут настройки — и ваш рабочий инструмент готов
        </p>
      </div>

      {/* Logo upload */}
      <div style={{ display: "flex", alignItems: "center", gap: "20px", marginBottom: "24px" }}>
        <div
          onClick={() => fileRef.current?.click()}
          style={{
            width: "72px", height: "72px", borderRadius: "20px", flexShrink: 0,
            background: data.logoPreviewUrl
              ? "transparent"
              : "linear-gradient(135deg, rgba(252,174,145,0.15), rgba(163,201,168,0.1))",
            border: "2px dashed rgba(252,174,145,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", overflow: "hidden",
            transition: "all 0.2s ease",
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = "#FCAE91")}
          onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(252,174,145,0.4)")}
        >
          {data.logoPreviewUrl ? (
            <img src={data.logoPreviewUrl} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="2" y="2" width="18" height="14" rx="3" stroke="#FCAE91" strokeWidth="1.5"/>
              <circle cx="8" cy="8" r="2" stroke="#FCAE91" strokeWidth="1.5"/>
              <path d="M2 14 L7 9 L11 13 L15 10 L20 14" stroke="#FCAE91" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M11 18 L11 22 M9 20 L13 20" stroke="#FCAE91" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg, image/png, image/webp" style={{ display: "none" }} onChange={handleFile} />
        <div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            style={{
              padding: "8px 16px", background: "rgba(252,174,145,0.1)",
              border: "1.5px solid rgba(252,174,145,0.3)", borderRadius: "10px",
              fontSize: "13px", fontWeight: 600, color: "#F9A08B",
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s ease",
              display: "block", marginBottom: "6px",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(252,174,145,0.18)"; e.currentTarget.style.borderColor = "#FCAE91"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(252,174,145,0.1)"; e.currentTarget.style.borderColor = "rgba(252,174,145,0.3)"; }}
          >
            {data.logoPreviewUrl ? "Заменить логотип" : "Загрузить логотип"}
          </button>
          <span style={{ fontSize: "11px", color: "#BBBBBB" }}>JPG, PNG, WEBP до 5 МБ</span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        <InputField
          label="Название студии или компании"
          placeholder="Например: Studio Forma"
          value={data.studioName}
          onChange={(v: string) => onChange({ studioName: v })}
        />

        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#666", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "8px" }}>
            Описание
          </label>
          <textarea
            placeholder="Кратко о студии, стиле работы, особенностях..."
            value={data.description}
            onChange={(e) => onChange({ description: e.target.value })}
            maxLength={300}
            rows={3}
            style={{
              width: "100%", padding: "13px 16px", boxSizing: "border-box",
              background: "rgba(26,26,26,0.03)", border: "1.5px solid transparent",
              borderRadius: "14px", fontSize: "14px", fontFamily: "inherit",
              color: "#1A1A1A", resize: "none", outline: "none",
              transition: "all 0.25s ease", lineHeight: "1.55",
            }}
            onFocus={e => { e.target.style.border = "1.5px solid #FCAE91"; e.target.style.boxShadow = "0 0 0 4px rgba(252,174,145,0.1)"; }}
            onBlur={e => { e.target.style.border = "1.5px solid transparent"; e.target.style.boxShadow = "none"; }}
          />
          <div style={{ textAlign: "right", fontSize: "11px", color: "#CCCCCC", marginTop: "4px" }}>
            {data.description.length}/300
          </div>
        </div>

        {data.studioName.trim().length > 0 && (
          <div style={{
            padding: "14px 16px", animation: "slideInRight 0.25s ease",
            background: "linear-gradient(135deg, rgba(252,174,145,0.07), rgba(163,201,168,0.04))",
            borderRadius: "14px", border: "1.5px solid rgba(252,174,145,0.18)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{
                width: "38px", height: "38px", borderRadius: "10px", flexShrink: 0, overflow: "hidden",
                background: data.logoPreviewUrl ? "transparent" : "linear-gradient(135deg, #FCAE91, #F9A08B)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "16px", fontWeight: 900, color: "white",
              }}>
                {data.logoPreviewUrl ? (
                  <img src={data.logoPreviewUrl} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : initials}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "14px", color: "#1A1A1A" }}>{data.studioName}</div>
                {data.description && (
                  <div style={{ fontSize: "12px", color: "#AAAAAA", marginTop: "2px", lineHeight: "1.4" }}>
                    {data.description.slice(0, 60)}{data.description.length > 60 ? "..." : ""}
                  </div>
                )}
              </div>
              <div style={{
                marginLeft: "auto", padding: "3px 8px",
                background: "rgba(163,201,168,0.18)", borderRadius: "6px",
                fontSize: "10px", fontWeight: 700, color: "#5A8A60", letterSpacing: "0.5px",
              }}>НОВЫЙ</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
