import React, { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { Employee } from "../../types";
import { getPresetServices } from "../../constants";

// ─── TYPES ────────────────────────────────────────────────────────────────────
type TabId = "profile" | "role" | "salary" | "schedule";

interface ScheduleDay { enabled: boolean; from: string; to: string; }

interface FormState {
  id: number; name: string; last_name: string; phone: string; email: string;
  role: string; avatar_gradient: string; is_online: boolean;
  services: string[]; salary: string; rate_type: "fixed" | "percent" | "hourly" | "";
  schedule: Record<string, ScheduleDay>;
  photo_url?: string;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const ROLE_ICONS: Record<string, React.ReactNode> = {
  trainer: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h12M6 20h12M8 4v16M16 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/>
    </svg>
  ),
  barber: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
      <path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12"/>
    </svg>
  ),
  stylist: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ),
  admin: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  masseur: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18c0-3 1.5-6 4-8l2-2a4 4 0 0 1 5.66 5.66l-2 2c-2 2-3 4.5-3 6"/>
      <circle cx="14" cy="6" r="2.5"/>
    </svg>
  ),
  cosmetologist: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
    </svg>
  ),
  yoga: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4" r="1.5"/>
      <path d="M12 6v6M9 9l-3 4h12l-3-4M7 19c1.5-1.5 3-2.5 5-2.5s3.5 1 5 2.5"/>
    </svg>
  ),
  nail: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C9.5 2 7 4.5 7 7.5c0 3.5 2 6.5 5 8.5 3-2 5-5 5-8.5C17 4.5 14.5 2 12 2z"/>
      <path d="M12 16v6M9 22h6"/>
    </svg>
  ),
};

const PRESET_ROLES: { id: string }[] = [
  { id: "trainer" },
  { id: "barber" },
  { id: "stylist" },
  { id: "admin" },
  { id: "masseur" },
  { id: "cosmetologist" },
  { id: "yoga" },
  { id: "nail" },
];


const DAYS: { key: string }[] = [
  { key: "mon" },
  { key: "tue" },
  { key: "wed" },
  { key: "thu" },
  { key: "fri" },
  { key: "sat" },
  { key: "sun" },
];

const TIME_OPTIONS = [
  "06:00","07:00","08:00","09:00","10:00","11:00","12:00",
  "13:00","14:00","15:00","16:00","17:00","18:00",
  "19:00","20:00","21:00","22:00","23:00",
];

const defaultSchedule: Record<string, ScheduleDay> = {
  mon: { enabled: true,  from: "09:00", to: "18:00" },
  tue: { enabled: true,  from: "09:00", to: "18:00" },
  wed: { enabled: true,  from: "09:00", to: "18:00" },
  thu: { enabled: true,  from: "09:00", to: "18:00" },
  fri: { enabled: true,  from: "09:00", to: "18:00" },
  sat: { enabled: false, from: "10:00", to: "16:00" },
  sun: { enabled: false, from: "10:00", to: "16:00" },
};

const TABS: TabId[] = ["profile", "role", "salary", "schedule"];

// ─── LIVE IDENTITY ILLUS ──────────────────────────────────────────────────────
function IdentityIllus({ name, role, is_online, avatar_gradient, photo }: {
  name: string; role: string; is_online: boolean; avatar_gradient: string; photo?: string;
}) {
  const { t } = useTranslation(["staff", "common"]);
  const initials = name.trim().length >= 2
    ? name.trim().split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";
  const displayRole = role ? t(`staff:roles.${role}`, { defaultValue: role }) : t("staff:profile.noRole");
  const enabledCount = 5;

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "18px" }}>
      <div style={{ position: "relative" }}>
        <div style={{
          width: "90px", height: "90px", borderRadius: "50%",
          background: photo ? "transparent" : avatar_gradient || "linear-gradient(135deg, #FCAE91, #F9A08B)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "28px", fontWeight: 900, color: "white",
          fontFamily: "Manrope, sans-serif",
          boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
          overflow: "hidden", flexShrink: 0,
          border: "4px solid white",
        }}>
          {photo
            ? <img src={photo} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
            : initials
          }
        </div>
        <div style={{
          position: "absolute", bottom: "4px", right: "4px",
          width: "16px", height: "16px", borderRadius: "50%",
          background: is_online ? "#5BAB72" : "#DDD",
          border: "2.5px solid white",
          boxShadow: is_online ? "0 0 8px rgba(91,171,114,0.5)" : "none",
          transition: "all 0.3s",
        }}/>
      </div>

      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "17px", fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.5px", marginBottom: "4px", transition: "all 0.2s", fontFamily: "Manrope, sans-serif" }}>
          {name || t("staff:profile.noName")}
        </div>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "#AAA", transition: "all 0.2s", fontFamily: "Manrope, sans-serif" }}>
          {displayRole}
        </div>
      </div>

      <div style={{ width: "100%", padding: "12px 14px", background: "rgba(26,26,26,0.025)", borderRadius: "12px", border: "1px solid rgba(26,26,26,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, color: "#BBBB", letterSpacing: "0.5px", textTransform: "uppercase", fontFamily: "Manrope, sans-serif" }}>{t("common:fields.status")}</span>
          <span style={{ fontSize: "10px", fontWeight: 700, color: is_online ? "#5BAB72" : "#AAA", fontFamily: "Manrope, sans-serif" }}>
            {is_online ? t("common:status.active") : t("common:status.inactive")}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: "10px", fontWeight: 700, color: "#BBBB", letterSpacing: "0.5px", textTransform: "uppercase", fontFamily: "Manrope, sans-serif" }}>{t("common:fields.schedule")}</span>
          <span style={{ fontSize: "10px", fontWeight: 700, color: "#1A1A1A", fontFamily: "Manrope, sans-serif" }}>{t("staff:editModal.status.daysCount", { count: enabledCount })}</span>
        </div>
      </div>

      <div style={{ width: "100%", display: "flex", flexWrap: "wrap", gap: "4px", justifyContent: "center" }}>
        {DAYS.map(day => (
          <div key={day.key} style={{
            padding: "3px 7px", borderRadius: "6px", fontSize: "9px", fontWeight: 700, fontFamily: "Manrope, sans-serif",
            background: ["mon","tue","wed","thu","fri"].includes(day.key) ? "rgba(252,174,145,0.18)" : "rgba(26,26,26,0.04)",
            color: ["mon","tue","wed","thu","fri"].includes(day.key) ? "#C07060" : "#CCC",
            border: ["mon","tue","wed","thu","fri"].includes(day.key) ? "1px solid rgba(252,174,145,0.3)" : "1px solid transparent",
          }}>
            {t(`common:days.short.${day.key}`)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────
function FocusInput({ value, onChange, placeholder, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder: string; type?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{
        width: "100%", padding: "11px 14px",
        background: focused ? "#fff" : "rgba(26,26,26,0.025)",
        border: focused ? "1.5px solid #FCAE91" : "1.5px solid rgba(26,26,26,0.09)",
        borderRadius: "11px", fontSize: "13px", fontWeight: 500, color: "#1A1A1A",
        outline: "none", fontFamily: "Manrope, sans-serif",
        boxShadow: focused ? "0 0 0 3px rgba(252,174,145,0.14)" : "none",
        transition: "all 0.18s ease", boxSizing: "border-box" as const,
      }}
    />
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: "block", fontSize: "10.5px", fontWeight: 700, color: "#AAAAAA",
      letterSpacing: "0.6px", textTransform: "uppercase" as const, marginBottom: "6px",
      fontFamily: "Manrope, sans-serif",
    }}>
      {children}
    </label>
  );
}

// ─── MAIN MODAL ───────────────────────────────────────────────────────────────
export interface EditEmployeeModalProps {
  isOpen: boolean;
  staff: Employee;
  onClose: () => void;
  onSave: (data: { name: string; role: string; phone: string; email: string }) => void;
  onDelete: (id: number) => void;
}

export function EditEmployeeModal({ isOpen, staff, onClose, onSave, onDelete }: EditEmployeeModalProps) {
  const { t } = useTranslation(["staff", "common"]);
  const [activeTab, setActiveTab]           = useState<TabId>("profile");
  const [form, setForm]                     = useState<FormState>({ ...buildInitialForm(staff) });
  const [saving, setSaving]                 = useState(false);
  const [saved, setSaved]                   = useState(false);
  const [photoPreview, setPhotoPreview]     = useState<string | undefined>(undefined);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [customServiceInput, setCustomServiceInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function buildInitialForm(s: Employee): FormState {
    return {
      id: s.id,
      name: s.name,
      last_name: s.last_name ?? "",
      phone: s.phone ?? "",
      email: s.email,
      role: s.role,
      avatar_gradient: s.avatar_gradient ?? "",
      is_online: s.is_online,
      services: [],
      salary: s.rate != null ? String(s.rate) : "",
      rate_type: s.rate_type ?? "",
      schedule: { ...defaultSchedule },
      photo_url: s.photo_url,
    };
  }

  useEffect(() => {
    if (isOpen && staff) {
      setForm(buildInitialForm(staff));
      setPhotoPreview(undefined);
      setShowDeleteConfirm(false);
      setSaved(false);
      setSaving(false);
      setActiveTab("profile");
      setCustomServiceInput("");
    }
  }, [isOpen, staff]);

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm(f => ({ ...f, [k]: v }));
  }, []);

  const handlePhotoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 700));
    setSaving(false);
    setSaved(true);
    onSave({ name: form.name, role: form.role, phone: form.phone, email: form.email });
    setTimeout(() => { setSaved(false); onClose(); }, 1200);
  }, [form, onSave, onClose]);

  const handleDelete = useCallback(() => {
    onDelete(form.id);
    onClose();
  }, [form.id, onDelete, onClose]);

  function toggleService(svc: string) {
    set("services", form.services.includes(svc)
      ? form.services.filter(s => s !== svc)
      : [...form.services, svc]
    );
  }

  function toggleDay(key: string) {
    set("schedule", { ...form.schedule, [key]: { ...form.schedule[key], enabled: !form.schedule[key].enabled } });
  }

  function updateDayTime(key: string, field: "from" | "to", val: string) {
    set("schedule", { ...form.schedule, [key]: { ...form.schedule[key], [field]: val } });
  }

  const presetServices = form.role ? getPresetServices(t, form.role) : [];

  const selectStyle: React.CSSProperties = {
    padding: "7px 6px", background: "rgba(26,26,26,0.03)",
    border: "1.5px solid rgba(26,26,26,0.09)", borderRadius: "8px",
    fontSize: "12px", fontWeight: 600, color: "#1A1A1A", outline: "none",
    fontFamily: "Manrope, sans-serif", cursor: "pointer", width: "76px",
    appearance: "none" as const,
  };

  if (!isOpen || !staff) return null;

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(26,26,26,0.40)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: "16px",
        animation: "eiOverlayIn 0.22s ease",
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes eiOverlayIn { from { opacity:0 } to { opacity:1 } }
        @keyframes eiModalIn   { from { opacity:0; transform: scale(0.93) translateY(20px) } to { opacity:1; transform: scale(1) translateY(0) } }
        @keyframes eiSlideIn   { from { opacity:0; transform: translateX(-10px) } to { opacity:1; transform: translateX(0) } }
        @keyframes eiCheckPop  { from { transform: scale(0.6); opacity:0 } to { transform: scale(1); opacity:1 } }
        @keyframes eiPulse     { 0%,100% { opacity:1; transform:scale(1) } 50% { opacity:0.5; transform:scale(1.5) } }
        @keyframes eiSavedIn   { from { opacity:0; transform: translateY(6px) } to { opacity:1; transform: translateY(0) } }
        .ei-tab { transition: color 0.15s, border-color 0.15s; cursor: pointer; }
        .ei-role-card { transition: all 0.18s cubic-bezier(0.34,1.1,0.64,1); }
        .ei-role-card:hover { border-color: #FCAE91 !important; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(252,174,145,0.15) !important; }
        .ei-svc-pill { transition: all 0.15s ease; cursor: pointer; }
        .ei-svc-pill:hover { border-color: rgba(252,174,145,0.6) !important; background: rgba(252,174,145,0.08) !important; }
        .ei-sched-row { transition: background 0.15s; }
        .ei-sched-row:hover { background: rgba(252,174,145,0.03) !important; }
        .ei-close { transition: background 0.15s; }
        .ei-close:hover { background: rgba(26,26,26,0.1) !important; }
        .ei-save { transition: all 0.2s ease; }
        .ei-save:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.05); }
        .ei-del-btn { transition: all 0.15s; }
        .ei-del-btn:hover { background: rgba(216,140,154,0.12) !important; }
        .ei-photo-btn { transition: all 0.15s; }
        .ei-photo-btn:hover { border-color: #FCAE91 !important; }
        .ei-scroll::-webkit-scrollbar { width: 3px; }
        .ei-scroll::-webkit-scrollbar-thumb { background: rgba(249,160,139,0.25); border-radius: 3px; }
      `}</style>

      <div
        style={{
          width: "100%", maxWidth: "860px", height: "min(600px, calc(100vh - 32px))",
          background: "#FDFCFB", borderRadius: "24px",
          boxShadow: "0 40px 100px rgba(26,26,26,0.18), 0 8px 32px rgba(26,26,26,0.07)",
          display: "grid", gridTemplateColumns: "260px 1fr",
          overflow: "hidden", animation: "eiModalIn 0.42s cubic-bezier(0.34,1.1,0.64,1)",
        }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── LEFT PANEL ── */}
        <div style={{
          background: "white", padding: "30px 24px 24px",
          display: "flex", flexDirection: "column",
          borderRight: "1px solid #F0EDE8",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: "radial-gradient(circle at 20% 20%, rgba(252,174,145,0.06) 0%, transparent 55%), radial-gradient(circle at 80% 80%, rgba(163,201,168,0.06) 0%, transparent 55%)",
          }}/>

          <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: "16px" }}>
              <IdentityIllus
                name={form.name}
                role={form.role}
                is_online={form.is_online}
                avatar_gradient={form.avatar_gradient}
                photo={photoPreview}
              />
            </div>

            <div style={{ padding: "14px 0 0", borderTop: "1px solid #F5F2EE" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "#AAAAAA", letterSpacing: "0.5px", textTransform: "uppercase", fontFamily: "Manrope, sans-serif" }}>{t("common:fields.status")}</span>
                <div
                  onClick={() => set("is_online", !form.is_online)}
                  style={{
                    display: "flex", alignItems: "center", gap: "8px", cursor: "pointer",
                    padding: "5px 10px", borderRadius: "8px",
                    background: form.is_online ? "rgba(91,171,114,0.1)" : "rgba(26,26,26,0.04)",
                    border: form.is_online ? "1px solid rgba(91,171,114,0.25)" : "1px solid rgba(26,26,26,0.07)",
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{
                    width: "28px", height: "15px", borderRadius: "7.5px",
                    background: form.is_online ? "#5BAB72" : "rgba(26,26,26,0.1)",
                    display: "flex", alignItems: "center", padding: "1.5px",
                    transition: "background 0.2s",
                  }}>
                    <div style={{
                      width: "12px", height: "12px", borderRadius: "50%",
                      background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      transform: form.is_online ? "translateX(13px)" : "translateX(0)",
                      transition: "transform 0.2s cubic-bezier(0.34,1.2,0.64,1)",
                    }}/>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: form.is_online ? "#4A8A52" : "#AAA", fontFamily: "Manrope, sans-serif", transition: "color 0.2s" }}>
                    {form.is_online ? t("staff:editModal.status.online") : t("staff:editModal.status.offline")}
                  </span>
                </div>
              </div>

              {!showDeleteConfirm ? (
                <button type="button" className="ei-del-btn"
                  onClick={() => setShowDeleteConfirm(true)}
                  style={{
                    width: "100%", padding: "9px 12px",
                    background: "transparent", border: "1.5px solid rgba(216,140,154,0.3)",
                    borderRadius: "10px", fontSize: "12px", fontWeight: 700,
                    color: "#D88C9A", cursor: "pointer", fontFamily: "Manrope, sans-serif",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                  </svg>
                  {t("staff:editModal.deleteEmployee")}
                </button>
              ) : (
                <div style={{ padding: "12px", background: "rgba(216,140,154,0.08)", borderRadius: "10px", border: "1.5px solid rgba(216,140,154,0.25)", animation: "eiSlideIn 0.2s ease" }}>
                  <p style={{ fontSize: "11px", fontWeight: 600, color: "#D88C9A", margin: "0 0 10px", lineHeight: 1.5, fontFamily: "Manrope, sans-serif" }}>
                    {t("staff:editModal.deleteConfirm", { name: form.name.split(" ")[0] || t("staff:editModal.defaultName") })}
                  </p>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button type="button" onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1, padding: "7px", background: "transparent", border: "1.5px solid rgba(26,26,26,0.1)", borderRadius: "8px", fontSize: "11px", fontWeight: 700, color: "#888", cursor: "pointer", fontFamily: "Manrope, sans-serif" }}>
                      {t("common:buttons.cancel")}
                    </button>
                    <button type="button" onClick={handleDelete} style={{ flex: 1, padding: "7px", background: "#D88C9A", border: "none", borderRadius: "8px", fontSize: "11px", fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "Manrope, sans-serif", boxShadow: "0 4px 12px rgba(216,140,154,0.3)" }}>
                      {t("common:buttons.delete")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{ padding: "0 0 24px", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
          <button type="button" className="ei-close" onClick={onClose} style={{
            position: "absolute", top: "14px", right: "14px",
            width: "28px", height: "28px",
            background: "rgba(26,26,26,0.05)", border: "none",
            borderRadius: "8px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#AAA", zIndex: 10,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          {/* ── TABS ── */}
          <div style={{ display: "flex", borderBottom: "1px solid #F0EDE8", padding: "0 28px", flexShrink: 0 }}>
            {TABS.map(tabId => (
              <button key={tabId} type="button" className="ei-tab"
                onClick={() => setActiveTab(tabId)}
                style={{
                  padding: "18px 16px 14px",
                  background: "transparent", border: "none",
                  fontSize: "13px", fontWeight: activeTab === tabId ? 700 : 500,
                  color: activeTab === tabId ? "#1A1A1A" : "#AAAAAA",
                  cursor: "pointer", fontFamily: "Manrope, sans-serif",
                  borderBottom: activeTab === tabId ? "2px solid #FCAE91" : "2px solid transparent",
                  marginBottom: "-1px", position: "relative",
                }}
              >
                {t(`staff:editModal.tabs.${tabId}`)}
              </button>
            ))}
          </div>

          {/* ── TAB CONTENT ── */}
          <div key={activeTab} className="ei-scroll"
            style={{ flex: 1, overflowY: "auto", padding: "24px 28px 0", animation: "eiSlideIn 0.22s ease" }}
          >

            {/* ── PROFILE TAB ── */}
            {activeTab === "profile" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                <div>
                  <p style={{ fontSize: "16px", fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.4px", margin: "0 0 4px", fontFamily: "Manrope, sans-serif" }}>{t("staff:editModal.profile.heading")}</p>
                  <p style={{ fontSize: "12px", color: "#AAAAAA", margin: "0 0 16px", fontFamily: "Manrope, sans-serif" }}>{t("staff:editModal.profile.sub")}</p>
                </div>

                <div>
                  <FieldLabel>{t("common:fields.photo")}</FieldLabel>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div style={{
                      width: "64px", height: "64px", borderRadius: "50%", flexShrink: 0,
                      background: photoPreview ? "transparent" : (form.avatar_gradient || "linear-gradient(135deg, #FCAE91, #F9A08B)"),
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "20px", fontWeight: 800, color: "white",
                      overflow: "hidden", border: "3px solid white",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontFamily: "Manrope, sans-serif",
                    }}>
                      {photoPreview
                        ? <img src={photoPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                        : (form.name.trim().split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?")
                      }
                    </div>
                    <div>
                      <input type="file" accept="image/*" ref={fileInputRef} onChange={handlePhotoChange} style={{ display: "none" }}/>
                      <button type="button" className="ei-photo-btn"
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          padding: "8px 14px",
                          background: "transparent",
                          border: "1.5px solid rgba(26,26,26,0.12)",
                          borderRadius: "10px", fontSize: "12px", fontWeight: 600,
                          color: "#555", cursor: "pointer", fontFamily: "Manrope, sans-serif",
                          display: "flex", alignItems: "center", gap: "6px",
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                        {t("staff:editModal.profile.uploadPhoto")}
                      </button>
                      <p style={{ fontSize: "10.5px", color: "#CCC", margin: "5px 0 0", fontFamily: "Manrope, sans-serif" }}>{t("staff:editModal.profile.photoHint")}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <FieldLabel>{t("common:fields.fullName")}</FieldLabel>
                  <FocusInput value={form.name} onChange={v => set("name", v)} placeholder={t("staff:editModal.profile.namePlaceholder")}/>
                </div>
                <div>
                  <FieldLabel>{t("common:fields.phone")}</FieldLabel>
                  <FocusInput type="tel" value={form.phone} onChange={v => set("phone", v)} placeholder="+7 (___) ___-__-__"/>
                </div>
                <div>
                  <FieldLabel>{t("common:fields.email")}</FieldLabel>
                  <FocusInput type="email" value={form.email} onChange={v => set("email", v)} placeholder="email@example.com"/>
                </div>
              </div>
            )}

            {/* ── ROLE TAB ── */}
            {activeTab === "role" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                <div>
                  <p style={{ fontSize: "16px", fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.4px", margin: "0 0 4px", fontFamily: "Manrope, sans-serif" }}>{t("staff:editModal.role.heading")}</p>
                  <p style={{ fontSize: "12px", color: "#AAAAAA", margin: "0 0 16px", fontFamily: "Manrope, sans-serif" }}>{t("staff:editModal.role.sub")}</p>
                </div>
                <div>
                  <FieldLabel>{t("common:fields.position")}</FieldLabel>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "7px", marginBottom: "10px" }}>
                    {PRESET_ROLES.map(r => {
                      const isSelected = form.role === r.id;
                      return (
                        <button key={r.id} type="button" className="ei-role-card"
                          onClick={() => {
                            const newRole = form.role === r.id ? "" : r.id;
                            set("role", newRole);
                            const autoServices = newRole ? getPresetServices(t, newRole) : [];
                            if (autoServices.length) set("services", autoServices);
                          }}
                          style={{
                            padding: "11px 6px",
                            background: isSelected ? "rgba(252,174,145,0.1)" : "rgba(26,26,26,0.02)",
                            border: isSelected ? "1.5px solid #FCAE91" : "1.5px solid rgba(26,26,26,0.08)",
                            borderRadius: "12px", cursor: "pointer",
                            display: "flex", flexDirection: "column", alignItems: "center", gap: "5px",
                            boxShadow: isSelected ? "0 4px 16px rgba(252,174,145,0.15)" : "none",
                            fontFamily: "Manrope, sans-serif", position: "relative",
                          }}
                        >
                          {isSelected && (
                            <div style={{
                              position: "absolute", top: "4px", right: "5px",
                              width: "12px", height: "12px",
                              background: "#FCAE91", borderRadius: "50%",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              animation: "eiCheckPop 0.25s cubic-bezier(0.34,1.1,0.64,1)",
                            }}>
                              <svg width="6" height="6" viewBox="0 0 8 8" fill="none"><path d="M1.5 4 L3 5.5 L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </div>
                          )}
                          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", color: isSelected ? "#FCAE91" : "#CCCCCC", transition: "color 0.18s" }}>
                            {ROLE_ICONS[r.id]}
                          </span>
                          <span style={{ fontSize: "9.5px", fontWeight: isSelected ? 700 : 500, color: isSelected ? "#1A1A1A" : "#888", textAlign: "center", lineHeight: 1.2 }}>
                            {t(`staff:roles.${r.id}`)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <FocusInput
                    value={PRESET_ROLES.find(r => r.id === form.role) ? "" : form.role}
                    onChange={val => set("role", val)}
                    placeholder={t("staff:editModal.role.positionPlaceholder")}
                  />
                </div>

                <div>
                  <FieldLabel>{t("common:fields.services")}</FieldLabel>
                  {presetServices.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
                      {presetServices.map(svc => {
                        const isOn = form.services.includes(svc);
                        return (
                          <button key={svc} type="button" className="ei-svc-pill"
                            onClick={() => toggleService(svc)}
                            style={{
                              padding: "6px 12px",
                              background: isOn ? "rgba(252,174,145,0.14)" : "rgba(26,26,26,0.04)",
                              border: isOn ? "1.5px solid rgba(252,174,145,0.5)" : "1.5px solid transparent",
                              borderRadius: "20px", fontSize: "12px",
                              fontWeight: isOn ? 700 : 500, color: isOn ? "#C07060" : "#666",
                              fontFamily: "Manrope, sans-serif",
                            }}
                          >
                            {isOn ? "✓ " : ""}{svc}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ position: "relative" }}>
                    <FocusInput
                      value={customServiceInput}
                      onChange={setCustomServiceInput}
                      placeholder={t("staff:editModal.role.addServicePlaceholder")}
                    />
                    {customServiceInput && (
                      <div style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "10px", fontWeight: 700, color: "#FCAE91", background: "rgba(252,174,145,0.12)", padding: "3px 7px", borderRadius: "6px", pointerEvents: "none" }}>
                        Enter ↵
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── SALARY TAB ── */}
            {activeTab === "salary" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                <div>
                  <p style={{ fontSize: "16px", fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.4px", margin: "0 0 4px", fontFamily: "Manrope, sans-serif" }}>{t("staff:editModal.salary.heading")}</p>
                  <p style={{ fontSize: "12px", color: "#AAAAAA", margin: "0 0 16px", fontFamily: "Manrope, sans-serif" }}>{t("staff:editModal.salary.sub")}</p>
                </div>
                <div>
                  <FieldLabel>{t("staff:editModal.salary.typeLabel")}</FieldLabel>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                    {(["fixed", "percent", "hourly"] as const).map(type => {
                      const icons: Record<string, React.ReactNode> = {
                        fixed: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12h.01"/><path d="M17 12h.01"/><path d="M7 12h.01"/></svg>,
                        percent: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
                        hourly: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
                      };
                      const isOn = form.rate_type === type;
                      return (
                        <button key={type} type="button"
                          onClick={() => set("rate_type", type)}
                          style={{
                            flex: 1, padding: "14px 10px",
                            background: isOn ? "rgba(252,174,145,0.1)" : "rgba(26,26,26,0.025)",
                            border: isOn ? "1.5px solid #FCAE91" : "1.5px solid rgba(26,26,26,0.08)",
                            borderRadius: "12px", cursor: "pointer",
                            display: "flex", flexDirection: "column", alignItems: "center", gap: "6px",
                            fontFamily: "Manrope, sans-serif", transition: "all 0.15s",
                          }}
                        >
                          <span style={{ color: isOn ? "#FCAE91" : "#CCC", transition: "color 0.15s" }}>
                            {icons[type]}
                          </span>
                          <span style={{ fontSize: "11px", fontWeight: isOn ? 700 : 500, color: isOn ? "#1A1A1A" : "#888" }}>{t(`common:salary.${type}`)}</span>
                        </button>
                      );
                    })}
                  </div>

                  {form.rate_type && (
                    <div style={{ animation: "eiSlideIn 0.2s ease" }}>
                      <FieldLabel>{t("common:fields.size")}</FieldLabel>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <input
                          type="number" value={form.salary}
                          onChange={e => set("salary", e.target.value)}
                          placeholder={form.rate_type === "percent" ? "25" : form.rate_type === "hourly" ? "500" : "50000"}
                          style={{ flex: 1, padding: "13px 15px", background: "rgba(26,26,26,0.025)", border: "1.5px solid rgba(26,26,26,0.09)", borderRadius: "11px", fontSize: "16px", fontWeight: 700, color: "#1A1A1A", outline: "none", fontFamily: "Manrope, sans-serif" }}
                        />
                        <div style={{ padding: "12px 16px", background: "rgba(252,174,145,0.1)", border: "1.5px solid rgba(252,174,145,0.3)", borderRadius: "11px", fontSize: "14px", fontWeight: 800, color: "#FCAE91", minWidth: "50px", textAlign: "center" }}>
                          {form.rate_type === "percent" ? "%" : form.rate_type === "hourly" ? "₽/ч" : "₽"}
                        </div>
                      </div>
                      {form.salary && form.rate_type === "fixed" && (
                        <p style={{ fontSize: "11px", color: "#AAAAAA", marginTop: "8px", fontFamily: "Manrope, sans-serif" }}>
                          ≈ {Math.round(Number(form.salary) / 4.3).toLocaleString("ru-RU")} {t("staff:editModal.salary.perWeek")}
                        </p>
                      )}
                    </div>
                  )}

                  {!form.rate_type && (
                    <div style={{ padding: "20px", textAlign: "center", background: "rgba(26,26,26,0.02)", borderRadius: "14px", border: "1.5px dashed rgba(26,26,26,0.08)" }}>
                      <p style={{ fontSize: "12px", color: "#CCCCCC", margin: 0, fontFamily: "Manrope, sans-serif" }}>{t("staff:editModal.salary.selectTypeHint")}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── SCHEDULE TAB ── */}
            {activeTab === "schedule" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <p style={{ fontSize: "16px", fontWeight: 800, color: "#1A1A1A", letterSpacing: "-0.4px", margin: "0 0 4px", fontFamily: "Manrope, sans-serif" }}>{t("staff:editModal.schedule.heading")}</p>
                  <p style={{ fontSize: "12px", color: "#AAAAAA", margin: "0 0 16px", fontFamily: "Manrope, sans-serif" }}>
                    {t("staff:editModal.schedule.activeDays", { count: Object.values(form.schedule).filter(d => d.enabled).length })}
                  </p>
                </div>
                <div style={{ border: "1.5px solid rgba(26,26,26,0.08)", borderRadius: "14px", overflow: "hidden" }}>
                  {DAYS.map((day, idx) => {
                    const d = form.schedule[day.key];
                    const isLast = idx === DAYS.length - 1;
                    return (
                      <div key={day.key} className="ei-sched-row" style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        padding: "9px 14px",
                        borderBottom: isLast ? "none" : "1px solid rgba(26,26,26,0.05)",
                        background: d.enabled ? "rgba(252,174,145,0.02)" : "transparent",
                      }}>
                        <div onClick={() => toggleDay(day.key)} style={{
                          width: "32px", height: "18px", borderRadius: "9px",
                          background: d.enabled ? "#FCAE91" : "rgba(26,26,26,0.1)",
                          display: "flex", alignItems: "center", padding: "2px",
                          cursor: "pointer", flexShrink: 0, transition: "background 0.2s",
                        }}>
                          <div style={{
                            width: "14px", height: "14px", borderRadius: "50%",
                            background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                            transform: d.enabled ? "translateX(14px)" : "translateX(0)",
                            transition: "transform 0.2s cubic-bezier(0.34,1.2,0.64,1)",
                          }}/>
                        </div>
                        <span style={{ width: "90px", fontSize: "12px", fontWeight: d.enabled ? 600 : 400, color: d.enabled ? "#1A1A1A" : "#C0C0C0", flexShrink: 0, transition: "all 0.15s", fontFamily: "Manrope, sans-serif" }}>
                          {t(`common:days.${day.key}`)}
                        </span>
                        {d.enabled ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "5px", flex: 1 }}>
                            <select value={d.from} onChange={e => updateDayTime(day.key, "from", e.target.value)} style={selectStyle}>
                              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <span style={{ fontSize: "11px", color: "#CCC", fontWeight: 700 }}>—</span>
                            <select value={d.to} onChange={e => updateDayTime(day.key, "to", e.target.value)} style={selectStyle}>
                              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                        ) : (
                          <span style={{ fontSize: "11px", color: "#CCC", fontStyle: "italic", flex: 1, fontFamily: "Manrope, sans-serif" }}>{t("staff:schedule.dayOff")}</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ padding: "11px 14px", background: "rgba(163,201,168,0.08)", borderRadius: "11px", border: "1px solid rgba(163,201,168,0.2)", display: "flex", gap: "9px", alignItems: "flex-start" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A3C9A8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }}>
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <p style={{ fontSize: "11.5px", color: "#666", margin: 0, lineHeight: 1.5, fontFamily: "Manrope, sans-serif" }}>
                    {t("staff:editModal.schedule.syncHint")}
                  </p>
                </div>
              </div>
            )}

          </div>

          {/* ── SAVE BUTTON ── */}
          <div style={{ padding: "16px 28px 0", flexShrink: 0, borderTop: "1px solid #F0EDE8", marginTop: "16px" }}>
            <button type="button" className="ei-save"
              disabled={saving || saved}
              onClick={handleSave}
              style={{
                width: "100%", padding: "13px 22px",
                background: saved
                  ? "linear-gradient(135deg, #A3C9A8, #7aab80)"
                  : "linear-gradient(135deg, #FCAE91, #F9A08B)",
                border: "none", borderRadius: "12px",
                fontSize: "14px", fontWeight: 700, color: "white",
                cursor: saving || saved ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                letterSpacing: "-0.1px",
                boxShadow: saved
                  ? "0 8px 24px rgba(163,201,168,0.35)"
                  : "0 8px 24px rgba(252,174,145,0.32)",
                fontFamily: "Manrope, sans-serif",
                opacity: saving ? 0.8 : 1,
              }}
            >
              {saving ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" style={{ animation: "spin 0.7s linear infinite" }}>
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.3"/>
                    <path d="M12 2a10 10 0 0 1 10 10"/>
                  </svg>
                  {t("common:buttons.saving")}
                </>
              ) : saved ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "eiCheckPop 0.3s ease" }}>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  {t("common:buttons.saved")}
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                    <polyline points="7 3 7 8 15 8"/>
                  </svg>
                  {t("common:buttons.saveChanges")}
                </>
              )}
            </button>
          </div>
        </div>

      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>,
    document.body
  );
}
