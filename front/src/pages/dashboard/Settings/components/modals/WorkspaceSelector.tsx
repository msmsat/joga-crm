import { useState } from "react";
import InputRow from "../ui/form/InputRow";
import type { Studio } from "../../types";

interface WorkspaceSelectorProps {
  studiosList: Studio[];
  setStudiosList: React.Dispatch<React.SetStateAction<Studio[]>>;
  onEnter: (studioName: string) => void;
  triggerToast: (msg: string) => void;
}

export default function WorkspaceSelector({
  studiosList, setStudiosList, onEnter, triggerToast,
}: WorkspaceSelectorProps) {
  const [isCreatingNewStudio, setIsCreatingNewStudio] = useState(false);
  const [createdStudioName, setCreatedStudioName] = useState("");
  const [createdStudioTheme, setCreatedStudioTheme] = useState<"light" | "dark">("light");
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999999, background: "#FDFCFB", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "inherit", padding: "24px", boxSizing: "border-box", animation: "fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}>
      <div style={{ position: "absolute", top: "10%", left: "15%", width: "400px", height: "400px", background: "radial-gradient(circle, rgba(252,174,145,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "10%", right: "15%", width: "500px", height: "500px", background: "radial-gradient(circle, rgba(155,181,216,0.05) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ width: "100%", maxWidth: "720px", position: "relative", zIndex: 2, display: "flex", flexDirection: "column", gap: "32px", animation: "drawerSlideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "inline-flex", padding: "10px", borderRadius: "14px", background: "rgba(252,174,145,0.1)", color: "var(--peach)", marginBottom: "16px" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </div>
          <h1 style={{ fontSize: "32px", fontWeight: 950, color: "#1A1A1A", margin: 0, letterSpacing: "-1px" }}>Ваши CRM системы</h1>
          <p style={{ fontSize: "14px", color: "var(--muted)", marginTop: "6px", fontWeight: 500 }}>Выберите рабочее пространство для авторизации или создайте новое</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          {studiosList.map((studio) => {
            const isDark = studio.theme === "dark";
            return (
              <div
                key={studio.id}
                onClick={() => onEnter(studio.name)}
                style={{ padding: "28px", borderRadius: "18px", cursor: "pointer", background: isDark ? "#121212" : "#FFFFFF", border: isDark ? "1.5px solid rgba(255,255,255,0.04)" : "1.5px solid rgba(26,26,26,0.06)", boxShadow: isDark ? "0 20px 40px rgba(0,0,0,0.3), 0 0 0 1px rgba(252,174,145,0.03)" : "0 16px 36px rgba(26,26,26,0.03)", display: "flex", flexDirection: "column", justifyContent: "space-between", height: "160px", transition: "all 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)", boxSizing: "border-box" }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.borderColor = "var(--peach)";
                  if (isDark) e.currentTarget.style.boxShadow = "0 24px 48px rgba(252,174,145,0.15), 0 0 12px rgba(252,174,145,0.1)";
                  else e.currentTarget.style.boxShadow = "0 24px 48px rgba(26,26,26,0.06)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.04)" : "rgba(26,26,26,0.06)";
                  e.currentTarget.style.boxShadow = isDark ? "0 20px 40px rgba(0,0,0,0.3)" : "0 16px 36px rgba(26,26,26,0.03)";
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px", color: isDark ? "rgba(255,255,255,0.3)" : "var(--muted)" }}>Бизнес-аккаунт</span>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: isDark ? "var(--peach)" : "#A3C9A8", boxShadow: isDark ? "0 0 8px var(--peach)" : "none" }} />
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: 800, color: isDark ? "#FFFFFF" : "#1A1A1A", letterSpacing: "-0.3px" }}>{studio.name}</div>
                </div>
                <div style={{ fontSize: "11.5px", color: isDark ? "rgba(255,255,255,0.4)" : "var(--muted)", lineHeight: "1.4" }}>{studio.desc}</div>
              </div>
            );
          })}
        </div>

        <div style={{ borderRadius: "18px", background: "#FFFFFF", border: `1.5px dashed ${isCreatingNewStudio ? "var(--peach)" : "rgba(26,26,26,0.15)"}`, boxShadow: isCreatingNewStudio ? "0 16px 36px rgba(252,174,145,0.08)" : "none", transition: "all 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)", overflow: isCreatingNewStudio ? "visible" : "hidden" }}>
          {!isCreatingNewStudio ? (
            <div
              onClick={() => setIsCreatingNewStudio(true)}
              style={{ padding: "20px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", color: "var(--peach)", fontWeight: 700, fontSize: "13.5px", cursor: "pointer" }}
              onMouseEnter={e => { e.currentTarget.parentElement!.style.borderColor = "var(--peach)"; e.currentTarget.parentElement!.style.background = "rgba(252,174,145,0.02)"; }}
              onMouseLeave={e => { e.currentTarget.parentElement!.style.borderColor = "rgba(26,26,26,0.15)"; e.currentTarget.parentElement!.style.background = "#FFFFFF"; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              Создать новую CRM-систему
            </div>
          ) : (
            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "18px", animation: "fadeSlideIn 0.2s ease" }}>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--onyx)", letterSpacing: "-0.2px" }}>Параметры нового пространства</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: "16px", alignItems: "flex-end" }}>
                <InputRow label="Название студии или салона" placeholder="Например: Stretch & Go" value={createdStudioName} onChange={setCreatedStudioName} />

                <div style={{ display: "flex", flexDirection: "column", gap: "6px", position: "relative", userSelect: "none" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", letterSpacing: "0.2px" }}>Тема оформления</label>
                  <div
                    onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: "10px", border: `1.5px solid ${isThemeMenuOpen ? "var(--peach)" : "var(--border)"}`, background: "#FFFFFF", fontSize: "13px", fontWeight: 700, color: "var(--onyx)", cursor: "pointer", boxShadow: isThemeMenuOpen ? "0 0 0 3px rgba(252,174,145,0.12)" : "none", transition: "all 0.2s ease", height: "38px", boxSizing: "border-box" }}
                  >
                    <span>{createdStudioTheme === "light" ? "Светлая" : "Тёмная"}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: isThemeMenuOpen ? "rotate(180deg)" : "none", transition: "transform 0.25s ease", color: "rgba(26,26,26,0.4)" }}>
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </div>

                  {isThemeMenuOpen && (
                    <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, left: 0, background: "#111111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "6px", boxShadow: "0 16px 40px rgba(0,0,0,0.45)", zIndex: 999, animation: "csPopupIn 0.2s cubic-bezier(0.34, 1.3, 0.64, 1) both" }}>
                      {[{ id: "light", label: "Светлая тема" }, { id: "dark", label: "Тёмная тема" }].map((opt) => (
                        <div
                          key={opt.id}
                          onClick={() => { setCreatedStudioTheme(opt.id as "light" | "dark"); setIsThemeMenuOpen(false); }}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: "8px", color: createdStudioTheme === opt.id ? "var(--peach)" : "rgba(255,255,255,0.7)", fontSize: "12px", fontWeight: createdStudioTheme === opt.id ? 700 : 600, cursor: "pointer", transition: "all 0.15s ease", background: createdStudioTheme === opt.id ? "rgba(252,174,145,0.15)" : "transparent" }}
                          onMouseOver={e => { if (createdStudioTheme !== opt.id) e.currentTarget.style.background = "rgba(252,174,145,0.08)"; }}
                          onMouseOut={e => { if (createdStudioTheme !== opt.id) e.currentTarget.style.background = "transparent"; }}
                        >
                          <span>{opt.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
                <button onClick={() => { setIsCreatingNewStudio(false); setCreatedStudioName(""); setIsThemeMenuOpen(false); }} className="topbar-ghost" style={{ padding: "9px 16px", fontSize: "12px" }}>Отмена</button>
                <button
                  onClick={() => {
                    if (!createdStudioName) return;
                    setStudiosList(prev => [...prev, {
                      id: Date.now().toString(),
                      name: createdStudioName,
                      theme: createdStudioTheme,
                      desc: createdStudioTheme === "light" ? "Жемчужно-алебастровый UI · Новая студия" : "Матовый глубокий графит · Новая студия",
                    }]);
                    triggerToast(`CRM Система "${createdStudioName}" успешно создана!`);
                    setCreatedStudioName("");
                    setIsCreatingNewStudio(false);
                  }}
                  style={{ padding: "9px 20px", borderRadius: "10px", background: "var(--peach)", border: "none", color: "white", fontSize: "12px", fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(252,174,145,0.35)" }}
                >
                  Инициализировать систему
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
