import React, { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { getPresetServices } from "../../pages/dashboard/Staff/constants";
import "../../App.css";

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface ScheduleDay { enabled: boolean; from: string; to: string; }

export interface StaffMember {
  id: number;
  name: string;
  last_name?: string;
  phone: string;
  email: string;
  role: string;
  department?: string;
  avatar_gradient?: string;
  is_online: boolean;
  services?: string[];
  rate?: number;
  rate_type?: "fixed" | "percent" | "hourly" | "";
  schedule?: Record<string, ScheduleDay>;
  photo_url?: string;
}

interface EditStaffModalProps {
  isOpen: boolean;
  staff: StaffMember | null;
  onClose: () => void;
  onSave?: (updated: StaffMember) => void;
  onDelete?: (id: number) => Promise<void> | void;
  ownerCount?: number;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const ROLE_TO_DEPT_KEY: Record<string, string> = {
  trainer:       "trainers",
  barber:        "masters",
  stylist:       "masters",
  admin:         "management",
  masseur:       "masters",
  cosmetologist: "masters",
  yoga:          "trainers",
  nail:          "masters",
};

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
      <path d="M12 2a5 5 0 0 1 5 5c0 3-2 5-5 7-3-2-5-4-5-7a5 5 0 0 1 5-5z"/>
      <path d="M12 14v8M8 22h8"/>
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
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
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
      <path d="M12 6v5l-3 3M12 11l3 3M7 19c1.5-1 3-3 5-3s3.5 2 5 3"/>
    </svg>
  ),
  nail: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C9 2 7 5 7 8c0 4 2 7 5 9 3-2 5-5 5-9 0-3-2-6-5-6z"/>
      <path d="M12 11v7M9 20h6"/>
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

const TAB_ICONS: Record<string, React.ReactNode> = {
  profile: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  ),
  role: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  salary: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  ),
  schedule: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
};

const TABS = ["profile", "role", "salary", "schedule"] as const;
type TabId = typeof TABS[number];

const defaultSchedule: Record<string, ScheduleDay> = {
  mon: { enabled: true,  from: "09:00", to: "18:00" },
  tue: { enabled: true,  from: "09:00", to: "18:00" },
  wed: { enabled: true,  from: "09:00", to: "18:00" },
  thu: { enabled: true,  from: "09:00", to: "18:00" },
  fri: { enabled: true,  from: "09:00", to: "18:00" },
  sat: { enabled: false, from: "10:00", to: "16:00" },
  sun: { enabled: false, from: "10:00", to: "16:00" },
};

// ─── ILLUSTRATIONS ─────────────────────────────────────────────────────────────

// Left panel: Live "identity card" that updates as you type
function IdentityIllus({
  name, role, photo, is_online, services, salary, rate_type, schedule
}: {
  name: string; role: string; photo?: string; is_online: boolean;
  services: string[]; salary: string; rate_type: string;
  schedule: Record<string, ScheduleDay>;
}) {
  const { t } = useTranslation(["staff", "common"]);
  const initials = name.trim().length >= 2
    ? name.trim().split(" ").map(w => w[0]).slice(0,2).join("").toUpperCase()
    : "?";
  const enabledDays = Object.values(schedule).filter(d => d.enabled).length;
  const effectiveRole = role
    ? t(`staff:roles.${role}`, { defaultValue: role })
    : t("staff:editModal.positionFallback");
  const salaryLabel = salary
    ? `${salary} ${rate_type === "percent" ? "%" : rate_type === "hourly" ? "₽/ч" : "₽"}`
    : "—";

  return (
    <svg viewBox="0 0 244 320" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ width: "100%", maxWidth: 244, display: "block" }}>
      <defs>
        <radialGradient id="eiBg" cx="50%" cy="30%" r="60%">
          <stop stopColor="rgba(252,174,145,0.10)" />
          <stop offset="1" stopColor="rgba(252,174,145,0)" />
        </radialGradient>
        <linearGradient id="eiAvatar" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FCAE91" />
          <stop offset="1" stopColor="#F07B60" />
        </linearGradient>
        <linearGradient id="eiCard" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="rgba(255,255,255,1)" />
          <stop offset="1" stopColor="rgba(253,252,251,0.98)" />
        </linearGradient>
        <linearGradient id="eiSalaryBar" x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#FCAE91" />
          <stop offset="1" stopColor="#A3C9A8" />
        </linearGradient>
        <filter id="eiShadow" x="-15%" y="-10%" width="130%" height="130%">
          <feDropShadow dx="0" dy="6" stdDeviation="14" floodColor="rgba(26,26,26,0.10)" />
        </filter>
        <clipPath id="eiAvatarClip">
          <circle cx="122" cy="72" r="32" />
        </clipPath>
      </defs>

      {/* Ambient glow */}
      <ellipse cx="122" cy="130" rx="90" ry="100" fill="url(#eiBg)" />

      {/* Floating sparkle dots */}
      <circle cx="28"  cy="48"  r="4.5" fill="#FCAE91" opacity="0.28" />
      <circle cx="216" cy="56"  r="3"   fill="#A3C9A8" opacity="0.35" />
      <circle cx="220" cy="240" r="4"   fill="#FCAE91" opacity="0.22" />
      <circle cx="24"  cy="248" r="3"   fill="#A3C9A8" opacity="0.30" />

      {/* ── Main card ── */}
      <rect x="20" y="24" width="204" height="272" rx="20"
        fill="url(#eiCard)" filter="url(#eiShadow)" stroke="#F0EDE8" strokeWidth="1" />

      {/* Peach header strip */}
      <path d="M20,44 a20,20 0 0 1 20,-20 h164 a20,20 0 0 1 20,20 v36 h-204 Z" fill="rgba(252,174,145,0.06)" />

      {/* Edit badge top-right */}
      <circle cx="202" cy="38" r="12" fill="white" stroke="#F0EDE8" strokeWidth="1" />
      <path d="M197 41 L200 36 L205 41 L200 46 Z" fill="rgba(249,160,139,0.8)" />

      {/* Avatar */}
      {photo ? (
        <image href={photo} x="90" y="40" width="64" height="64" clipPath="url(#eiAvatarClip)" />
      ) : (
        <circle cx="122" cy="72" r="32" fill="url(#eiAvatar)" />
      )}
      {!photo && (
        <text x="122" y="79" textAnchor="middle" fontSize="15" fontWeight="800"
          fill="white" fontFamily="Manrope, sans-serif">{initials}</text>
      )}

      {/* Online dot */}
      <circle cx="147" cy="96" r="7.5" fill="white" />
      <circle cx="147" cy="96" r="5" fill={is_online ? "#A3C9A8" : "#CCCCCC"} />

      {/* Name */}
      {name.trim().length >= 2 ? (
        <text x="122" y="124" textAnchor="middle" fontSize="12" fontWeight="700"
          fill="#1A1A1A" fontFamily="Manrope, sans-serif">
          {name.length > 18 ? name.slice(0,17) + "…" : name}
        </text>
      ) : (
        <rect x="72" y="117" width="100" height="8" rx="4" fill="rgba(26,26,26,0.08)" />
      )}

      {/* Role pill */}
      <rect x="66" y="132" width="112" height="18" rx="9"
        fill="rgba(252,174,145,0.15)" stroke="rgba(252,174,145,0.35)" strokeWidth="1" />
      <text x="122" y="144.5" textAnchor="middle" fontSize="9" fontWeight="700"
        fill="#C07060" fontFamily="Manrope, sans-serif">
        {effectiveRole.length > 16 ? effectiveRole.slice(0,15) + "…" : effectiveRole}
      </text>

      {/* Divider */}
      <line x1="40" y1="162" x2="204" y2="162" stroke="#F0EDE8" strokeWidth="1" />

      {/* Stats row */}
      {[
        { label: t("common:fields.services"), value: String(services.length) },
        { label: t("staff:editModal.schedule.daysLabel"), value: String(enabledDays) },
        { label: t("common:fields.salary"), value: salaryLabel.length > 6 ? salaryLabel.slice(0,6) + "…" : salaryLabel },
      ].map((s, i) => {
        const cx = 56 + i * 66;
        return (
          <g key={s.label}>
            <text x={cx} y="181" textAnchor="middle" fontSize="14" fontWeight="800"
              fill="#1A1A1A" fontFamily="Manrope, sans-serif">{s.value}</text>
            <text x={cx} y="193" textAnchor="middle" fontSize="8.5" fontWeight="600"
              fill="#BBBBBB" fontFamily="Manrope, sans-serif">{s.label}</text>
            {i < 2 && <line x1={cx + 33} y1="168" x2={cx + 33} y2="198"
              stroke="#F0EDE8" strokeWidth="1" />}
          </g>
        );
      })}

      {/* Divider */}
      <line x1="40" y1="208" x2="204" y2="208" stroke="#F0EDE8" strokeWidth="1" />

      {/* Schedule mini-week */}
      {DAYS.map((d, i) => {
        const enabled = schedule[d.key]?.enabled ?? false;
        const cx = 44 + i * 24;
        return (
          <g key={d.key}>
            <rect x={cx - 9} y="218" width="18" height="18" rx="5"
              fill={enabled ? "rgba(252,174,145,0.5)" : "rgba(26,26,26,0.05)"}
              stroke={enabled ? "rgba(252,174,145,0.7)" : "transparent"} strokeWidth="1" />
            {enabled && (
              <path d={`M${cx-3.5} 227 L${cx} 231 L${cx+5} 223`}
                stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </g>
        );
      })}

      {/* Active days label */}
      <text x="122" y="254" textAnchor="middle" fontSize="9" fontWeight="600"
        fill="#BBBBBB" fontFamily="Manrope, sans-serif">
        {t("staff:editModal.schedule.workDays", { count: enabledDays })}
      </text>

      {/* Salary gradient bar */}
      {salary && (
        <g>
          <rect x="40" y="262" width="164" height="4" rx="2" fill="rgba(26,26,26,0.05)" />
          <rect x="40" y="262"
            width={Math.min(164, 20 + Number(salary.replace(/\D/g, "")) / 1000)}
            height="4" rx="2" fill="url(#eiSalaryBar)" />
        </g>
      )}

      {/* Services tags */}
      {services.slice(0,3).map((svc, i) => (
        <g key={svc}>
          <rect x={40 + i * 58} y="272" width="50" height="12" rx="6"
            fill="rgba(163,201,168,0.15)" />
          <text x={65 + i * 58} y="281.5" textAnchor="middle" fontSize="6.5" fontWeight="700"
            fill="#6A9E72" fontFamily="Manrope, sans-serif">
            {svc.length > 7 ? svc.slice(0,6) + "…" : svc}
          </text>
        </g>
      ))}
      {services.length > 3 && (
        <text x="196" y="281.5" textAnchor="middle" fontSize="6.5" fontWeight="700"
          fill="#CCCCCC" fontFamily="Manrope, sans-serif">+{services.length - 3}</text>
      )}
    </svg>
  );
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: "block", fontSize: "11px", fontWeight: 700, color: "#999",
      letterSpacing: "0.6px", textTransform: "uppercase" as const, marginBottom: "7px",
    }}>
      {children}
    </label>
  );
}

function FocusInput({
  value, onChange, placeholder, type = "text", onKeyDown, disabled
}: {
  value: string; onChange: (v: string) => void; placeholder: string;
  type?: string; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type} value={value} disabled={disabled}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder} onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={{
        width: "100%", padding: "11px 14px",
        background: disabled ? "rgba(26,26,26,0.02)" : focused ? "#fff" : "rgba(26,26,26,0.025)",
        border: focused ? "1.5px solid #FCAE91" : "1.5px solid rgba(26,26,26,0.09)",
        borderRadius: "12px", fontSize: "14px", fontWeight: 500, color: "#1A1A1A",
        outline: "none", fontFamily: "Manrope, sans-serif",
        boxShadow: focused ? "0 0 0 3px rgba(252,174,145,0.14)" : "none",
        transition: "all 0.18s ease", boxSizing: "border-box" as const,
        opacity: disabled ? 0.5 : 1,
      }}
    />
  );
}

// ─── MAIN MODAL ───────────────────────────────────────────────────────────────
export default function EditStaffModal({ isOpen, staff, onClose, onSave, onDelete, ownerCount }: EditStaffModalProps) {
  const { t } = useTranslation(["staff", "common"]);
  const [activeTab, setActiveTab]     = useState<TabId>("profile");
  const [saving, setSaving]           = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saved, setSaved]             = useState(false);
  const [customSvcInput, setCustomSvcInput] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | undefined>(staff?.photo_url);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<{
    id: number;
    name: string;
    last_name: string;
    phone: string;
    email: string;
    role: string;
    department: string;
    avatar_gradient: string;
    is_online: boolean;
    services: string[];
    salary: string;
    rate_type: "fixed" | "percent" | "hourly" | "";
    schedule: Record<string, ScheduleDay>;
    photo_url?: string;
  }>({
    id: 0, name: "", last_name: "", phone: "", email: "", role: "", department: "",
    avatar_gradient: "", is_online: true, services: [], salary: "", rate_type: "",
    schedule: { ...defaultSchedule },
  });

  // Sync when staff changes
  useEffect(() => {
    if (staff) {
      setForm({
        id:             staff.id,
        name:           staff.name,
        last_name:      staff.last_name ?? "",
        phone:          staff.phone,
        email:          staff.email,
        role:           staff.role,
        department:     staff.department ?? ROLE_TO_DEPT_KEY[staff.role] ?? "",
        avatar_gradient: staff.avatar_gradient ?? "",
        is_online:      staff.is_online,
        services:       staff.services ?? [],
        salary:         staff.rate != null ? String(staff.rate) : "",
        rate_type:      staff.rate_type ?? "",
        schedule:       staff.schedule ?? { ...defaultSchedule },
        photo_url:      staff.photo_url,
      });
      setPhotoPreview(staff.photo_url);
      setShowDeleteConfirm(false);
      setSaved(false);
      setActiveTab("profile");
    }
  }, [staff]);

  const set = useCallback(<K extends keyof typeof form>(k: K, v: typeof form[K]) => {
    setForm(d => ({ ...d, [k]: v }));
  }, []);

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const url = ev.target?.result as string;
      setPhotoPreview(url);
      set("photo" as any, url);
    };
    reader.readAsDataURL(file);
  }

  function removePhoto() {
    setPhotoPreview(undefined);
    set("photo" as any, undefined);
    if (fileRef.current) fileRef.current.value = "";
  }

  function toggleService(svc: string) {
    set("services", form.services.includes(svc)
      ? form.services.filter(s => s !== svc)
      : [...form.services, svc]
    );
  }

  function handleSvcKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && customSvcInput.trim()) {
      const t = customSvcInput.trim();
      if (!form.services.includes(t)) set("services", [...form.services, t]);
      setCustomSvcInput("");
    }
  }

  function toggleDay(key: string) {
    set("schedule", { ...form.schedule, [key]: { ...form.schedule[key], enabled: !form.schedule[key].enabled } });
  }

  function updateTime(key: string, field: "from" | "to", val: string) {
    set("schedule", { ...form.schedule, [key]: { ...form.schedule[key], [field]: val } });
  }

  async function handleSave() {
    setSaving(true);
    await new Promise(r => setTimeout(r, 700));
    const finalDepartment = form.department || ROLE_TO_DEPT_KEY[form.role] || form.role;
    onSave?.({ ...form, department: finalDepartment, rate: form.salary ? parseFloat(form.salary) : undefined });
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 1200);
  }

  function handleDelete() {
    onDelete?.(form.id);
    onClose();
  }

  const presetSvcs = getPresetServices(t, form.role);
  const enabledDays = Object.values(form.schedule).filter(d => d.enabled).length;

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
        background: "rgba(26,26,26,0.42)",
        backdropFilter: "blur(10px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: "16px",
        animation: "eiOverlayIn 0.22s ease",
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes eiOverlayIn { from{opacity:0} to{opacity:1} }
        @keyframes eiModalIn { from{opacity:0;transform:scale(0.93) translateY(18px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes eiSlideIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes eiCheckPop { from{transform:scale(0.5);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes eiPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.6)} }
        @keyframes eiSavedIn { from{opacity:0;transform:scale(0.8)} to{opacity:1;transform:scale(1)} }

        .ei-tab { transition: all 0.18s ease; cursor: pointer; }
        .ei-tab:hover:not(.ei-tab-active) { background: rgba(252,174,145,0.06) !important; }
        .ei-role-card { transition: all 0.18s cubic-bezier(0.34,1.1,0.64,1); cursor: pointer; }
        .ei-role-card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(252,174,145,0.14) !important; }
        .ei-svc-pill { transition: all 0.15s ease; cursor: pointer; }
        .ei-svc-pill:hover { border-color: rgba(252,174,145,0.6) !important; }
        .ei-sched-row { transition: background 0.15s; }
        .ei-sched-row:hover { background: rgba(252,174,145,0.03) !important; }
        .ei-close:hover { background: rgba(26,26,26,0.1) !important; }
        .ei-save:hover:not(:disabled) { filter: brightness(1.05); transform: translateY(-1px); }
        .ei-del-btn:hover { background: rgba(216,140,154,0.15) !important; border-color: rgba(216,140,154,0.5) !important; }
        .ei-photo-btn:hover { border-color: #FCAE91 !important; background: rgba(252,174,145,0.05) !important; }
        .ei-scroll::-webkit-scrollbar { width: 3px; }
        .ei-scroll::-webkit-scrollbar-thumb { background: rgba(249,160,139,0.25); border-radius: 3px; }
        .ei-salary-type:hover { border-color: rgba(252,174,145,0.5) !important; }
      `}</style>

      <div
        style={{
          width: "100%", maxWidth: "860px", height: "600px",
          background: "#FDFCFB", borderRadius: "24px",
          boxShadow: "0 40px 100px rgba(26,26,26,0.18), 0 8px 32px rgba(26,26,26,0.07)",
          display: "grid", gridTemplateColumns: "260px 1fr",
          overflow: "hidden",
          animation: "eiModalIn 0.42s cubic-bezier(0.34,1.1,0.64,1)",
        }}
        onClick={e => e.stopPropagation()}
      >

        {/* ──────────── LEFT PANEL ──────────── */}
        <div style={{
          background: "white", borderRight: "1px solid #F0EDE8",
          display: "flex", flexDirection: "column",
          padding: "28px 22px 22px", position: "relative", overflow: "hidden",
        }}>
          {/* Mesh */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: `
              radial-gradient(circle at 15% 10%, rgba(252,174,145,0.07) 0%, transparent 55%),
              radial-gradient(circle at 85% 90%, rgba(163,201,168,0.07) 0%, transparent 55%)
            `,
          }} />

          {/* Header */}
          <div style={{ position: "relative", zIndex: 1, marginBottom: "16px" }}>
            <p style={{ fontSize: "10px", fontWeight: 700, color: "#FCAE91", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 4px" }}>
              {t("staff:editModal.header")}
            </p>
            <h2 style={{ fontSize: "16px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.4px", margin: 0, lineHeight: 1.3 }}>
              {form.name || t("staff:editModal.employeeFallback")}
            </h2>
            <p style={{ fontSize: "11px", color: "#AAAAAA", margin: "3px 0 0" }}>
              {form.role ? t(`staff:roles.${form.role}`, { defaultValue: form.role }) : t("staff:editModal.positionFallback")}
            </p>
          </div>

          {/* Live Illustration */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
            <IdentityIllus
              name={form.name}
              role={form.role}
              photo={photoPreview}
              is_online={form.is_online}
              services={form.services}
              salary={form.salary}
              rate_type={form.rate_type}
              schedule={form.schedule}
            />
          </div>

          {/* Bottom: status + online toggle */}
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{
              padding: "11px 13px", borderRadius: "10px",
              background: "rgba(26,26,26,0.025)",
              border: "1px solid rgba(26,26,26,0.07)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: "10px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{
                  width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0,
                  background: form.is_online ? "#A3C9A8" : "#DDDDDD",
                  animation: form.is_online ? "eiPulse 2.2s infinite" : "none",
                }} />
                <span style={{ fontSize: "11px", color: "#666", fontWeight: 500 }}>
                  {form.is_online ? t("staff:editModal.status.onlineNow") : t("staff:editModal.status.notOnline")}
                </span>
              </div>
              {/* Toggle */}
              <div onClick={() => set("is_online", !form.is_online)} style={{
                width: "30px", height: "17px", borderRadius: "8.5px",
                background: form.is_online ? "#FCAE91" : "rgba(26,26,26,0.12)",
                position: "relative", cursor: "pointer", transition: "background 0.2s",
              }}>
                <div style={{
                  position: "absolute", top: "1.5px",
                  left: form.is_online ? "14.5px" : "1.5px",
                  width: "14px", height: "14px", borderRadius: "50%",
                  background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                  transition: "left 0.2s cubic-bezier(0.34,1.2,0.64,1)",
                }} />
              </div>
            </div>

            {/* Delete */}
            {staff?.role === 'owner' && (ownerCount ?? 1) <= 1 ? (
              <div style={{
                padding: "11px 13px", borderRadius: "10px",
                background: "rgba(216,140,154,0.07)",
                border: "1.5px solid rgba(216,140,154,0.22)",
                display: "flex", alignItems: "center", gap: "8px",
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#C06070" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#C06070", fontFamily: "Manrope, sans-serif", lineHeight: 1.4 }}>
                  {t("staff:editModal.cannotDeleteLastOwner")}
                </span>
              </div>
            ) : !showDeleteConfirm ? (
              <button type="button" className="ei-del-btn" onClick={() => setShowDeleteConfirm(true)} style={{
                width: "100%", padding: "10px",
                background: "rgba(216,140,154,0.08)",
                border: "1.5px solid rgba(216,140,154,0.25)",
                borderRadius: "10px", fontSize: "12px", fontWeight: 700,
                color: "#C06070", cursor: "pointer", fontFamily: "Manrope, sans-serif",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                transition: "all 0.15s",
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3,6 5,6 21,6" /><path d="M19,6l-1,14H6L5,6" /><path d="M10,11v6M14,11v6" /><path d="M9,6V4h6v2" />
                </svg>
                {t("staff:editModal.deleteEmployee")}
              </button>
            ) : (
              <div style={{
                padding: "11px 13px", borderRadius: "10px",
                background: "rgba(216,140,154,0.10)",
                border: "1.5px solid rgba(216,140,154,0.35)",
                animation: "eiSlideIn 0.2s ease",
              }}>
                <p style={{ fontSize: "11px", fontWeight: 700, color: "#C06070", margin: "0 0 8px", textAlign: "center" }}>
                  {t("staff:editModal.deleteConfirm", { name: form.name.split(" ")[0] || t("staff:editModal.defaultName") })}
                </p>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => setShowDeleteConfirm(false)} style={{
                    flex: 1, padding: "7px", background: "white",
                    border: "1px solid #EEEBE6", borderRadius: "8px",
                    fontSize: "11px", fontWeight: 600, color: "#888",
                    cursor: "pointer", fontFamily: "Manrope, sans-serif",
                  }}>{t("common:buttons.cancel")}</button>
                  <button onClick={handleDelete} style={{
                    flex: 1, padding: "7px",
                    background: "linear-gradient(135deg, #D88C9A, #C07080)",
                    border: "none", borderRadius: "8px",
                    fontSize: "11px", fontWeight: 700, color: "white",
                    cursor: "pointer", fontFamily: "Manrope, sans-serif",
                  }}>{t("common:buttons.delete")}</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ──────────── RIGHT PANEL ──────────── */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Close */}
          <button className="ei-close" onClick={onClose} style={{
            position: "absolute", top: "16px", right: "16px", zIndex: 10,
            width: "28px", height: "28px",
            background: "rgba(26,26,26,0.05)", border: "none", borderRadius: "8px",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            color: "#AAAAAA", transition: "background 0.15s",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* Tab bar */}
          <div style={{
            display: "flex", gap: "2px", padding: "16px 24px 0",
            borderBottom: "1px solid #F0EDE8", flexShrink: 0,
          }}>
            {TABS.map(tabId => {
              const isActive = activeTab === tabId;
              return (
                <button
                  key={tabId}
                  className={`ei-tab${isActive ? " ei-tab-active" : ""}`}
                  onClick={() => setActiveTab(tabId)}
                  style={{
                    padding: "9px 14px 10px",
                    background: isActive ? "rgba(252,174,145,0.1)" : "transparent",
                    border: "none",
                    borderBottom: isActive ? "2px solid #FCAE91" : "2px solid transparent",
                    borderRadius: "8px 8px 0 0",
                    fontSize: "12px", fontWeight: isActive ? 700 : 500,
                    color: isActive ? "#1A1A1A" : "#AAAAAA",
                    cursor: "pointer", fontFamily: "Manrope, sans-serif",
                    display: "flex", alignItems: "center", gap: "6px",
                    transition: "all 0.15s",
                    marginBottom: "-1px",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", color: isActive ? "#FCAE91" : "#CCCCCC", transition: "color 0.15s" }}>
                    {TAB_ICONS[tabId]}
                  </span>
                  {t(`staff:editModal.tabs.${tabId}`)}
                </button>
              );
            })}
          </div>

          {/* Scrollable content */}
          <div className="ei-scroll" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 16px" }}>
            <div key={activeTab} style={{ animation: "eiSlideIn 0.22s cubic-bezier(0.34,1.1,0.64,1)" }}>

              {/* ══ TAB: PROFILE ══ */}
              {activeTab === "profile" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {/* Photo upload */}
                  <div>
                    <FieldLabel>{t("common:fields.photo")}</FieldLabel>
                    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                      {/* Avatar preview */}
                      <div style={{
                        width: "56px", height: "56px", borderRadius: "16px", flexShrink: 0,
                        background: photoPreview ? "transparent" : "linear-gradient(135deg, #FCAE91, #F9A08B)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "18px", fontWeight: 800, color: "white",
                        overflow: "hidden", position: "relative",
                        boxShadow: "0 4px 14px rgba(252,174,145,0.25)",
                      }}>
                        {photoPreview
                          ? <img src={photoPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : form.name.trim().split(" ").map(w => w[0]).slice(0,2).join("").toUpperCase() || "?"
                        }
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                        <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} />
                        <button type="button" className="ei-photo-btn" onClick={() => fileRef.current?.click()} style={{
                          padding: "8px 14px",
                          background: "rgba(26,26,26,0.02)", border: "1.5px solid rgba(26,26,26,0.09)",
                          borderRadius: "10px", fontSize: "12px", fontWeight: 600, color: "#555",
                          cursor: "pointer", fontFamily: "Manrope, sans-serif", transition: "all 0.15s",
                        }}>
                          {photoPreview ? t("staff:editModal.profile.replacePhoto") : t("staff:editModal.profile.uploadPhoto")}
                        </button>
                        {photoPreview && (
                          <button type="button" onClick={removePhoto} style={{
                            padding: "5px 12px",
                            background: "transparent", border: "none",
                            fontSize: "11px", fontWeight: 600, color: "#D88C9A",
                            cursor: "pointer", fontFamily: "Manrope, sans-serif",
                          }}>
                            {t("staff:editModal.profile.removePhoto")}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Name */}
                  <div>
                    <FieldLabel>{t("common:fields.fullName")} *</FieldLabel>
                    <FocusInput value={form.name} onChange={v => set("name", v)} placeholder={t("staff:editModal.profile.namePlaceholder")} />
                  </div>

                  {/* Phone + Email in a row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                      <FieldLabel>{t("common:fields.phone")}</FieldLabel>
                      <FocusInput type="tel" value={form.phone} onChange={v => set("phone", v)} placeholder="+7 900 000-00-00" />
                    </div>
                    <div>
                      <FieldLabel>{t("common:fields.email")}</FieldLabel>
                      <FocusInput type="email" value={form.email} onChange={v => set("email", v)} placeholder="email@studio.ru" />
                    </div>
                  </div>

                  {/* Info tip */}
                  <div style={{
                    padding: "12px 14px", borderRadius: "12px",
                    background: "rgba(252,174,145,0.06)", border: "1px solid rgba(252,174,145,0.18)",
                    display: "flex", gap: "9px", alignItems: "flex-start",
                  }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#A3C9A8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }}>
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <p style={{ fontSize: "11.5px", color: "#888", margin: 0, lineHeight: 1.55 }}>
                      {t("staff:editModal.profile.notifyHint")}
                    </p>
                  </div>
                </div>
              )}

              {/* ══ TAB: ROLE ══ */}
              {activeTab === "role" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                  <div>
                    <FieldLabel>{t("common:fields.position")}</FieldLabel>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "7px", marginBottom: "10px" }}>
                      {PRESET_ROLES.map(r => {
                        const isSelected = form.role === r.id;
                        return (
                          <button key={r.id} type="button" className="ei-role-card"
                            onClick={() => {
                              const nr = form.role === r.id ? "" : r.id;
                              set("role", nr);
                              set("department", nr ? (ROLE_TO_DEPT_KEY[nr] ?? "") : "");
                              const autoSvcs = nr ? getPresetServices(t, nr) : [];
                              if (autoSvcs.length) set("services", autoSvcs);
                            }}
                            style={{
                              padding: "11px 6px",
                              background: isSelected ? "rgba(252,174,145,0.1)" : "rgba(26,26,26,0.02)",
                              border: isSelected ? "1.5px solid #FCAE91" : "1.5px solid rgba(26,26,26,0.08)",
                              borderRadius: "12px",
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
                                <svg width="6" height="6" viewBox="0 0 8 8" fill="none">
                                  <path d="M1.5 4 L3 5.5 L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </div>
                            )}
                            <span style={{
                              display: "flex", alignItems: "center", justifyContent: "center",
                              color: isSelected ? "#FCAE91" : "#BBBBBB",
                              transition: "color 0.18s",
                            }}>
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
                      onChange={v => set("role", v)}
                      placeholder={t("staff:editModal.role.positionPlaceholder")}
                    />
                  </div>

                  {/* Services */}
                  <div>
                    <FieldLabel>{t("common:fields.services")} ({form.services.length})</FieldLabel>
                    {presetSvcs.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
                        {presetSvcs.map(svc => {
                          const on = form.services.includes(svc);
                          return (
                            <button key={svc} type="button" className="ei-svc-pill"
                              onClick={() => toggleService(svc)}
                              style={{
                                padding: "6px 12px",
                                background: on ? "rgba(252,174,145,0.14)" : "rgba(26,26,26,0.04)",
                                border: on ? "1.5px solid rgba(252,174,145,0.5)" : "1.5px solid transparent",
                                borderRadius: "20px", fontSize: "12px",
                                fontWeight: on ? 700 : 500, color: on ? "#C07060" : "#666",
                                cursor: "pointer", fontFamily: "Manrope, sans-serif",
                                transition: "all 0.15s",
                              }}
                            >
                              {on ? "✓ " : ""}{svc}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {/* Custom services */}
                    {form.services.filter(s => !presetSvcs.includes(s)).length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
                        {form.services.filter(s => !presetSvcs.includes(s)).map(svc => (
                          <div key={svc} style={{
                            display: "flex", alignItems: "center", gap: "5px",
                            padding: "5px 10px 5px 12px",
                            background: "rgba(163,201,168,0.12)",
                            border: "1.5px solid rgba(163,201,168,0.35)",
                            borderRadius: "20px", fontSize: "12px", fontWeight: 600, color: "#5A8A60",
                          }}>
                            {svc}
                            <span onClick={() => toggleService(svc)} style={{ cursor: "pointer", opacity: 0.6, fontSize: "11px" }}>✕</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ position: "relative" }}>
                      <FocusInput
                        value={customSvcInput} onChange={setCustomSvcInput}
                        onKeyDown={handleSvcKeyDown}
                        placeholder={t("staff:editModal.role.addServicePlaceholder")}
                      />
                      {customSvcInput && (
                        <div style={{
                          position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
                          fontSize: "10px", fontWeight: 700, color: "#FCAE91",
                          background: "rgba(252,174,145,0.12)", padding: "3px 7px", borderRadius: "6px",
                          pointerEvents: "none",
                        }}>Enter ↵</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ══ TAB: SALARY ══ */}
              {activeTab === "salary" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  {/* Big salary display */}
                  <div style={{
                    padding: "20px 22px",
                    background: "linear-gradient(135deg, rgba(252,174,145,0.08), rgba(163,201,168,0.05))",
                    borderRadius: "16px", border: "1.5px solid rgba(252,174,145,0.18)",
                    textAlign: "center",
                  }}>
                    <p style={{ fontSize: "10px", fontWeight: 700, color: "#AAAAAA", textTransform: "uppercase", letterSpacing: "0.6px", margin: "0 0 6px" }}>
                      {t("staff:editModal.salary.currentLabel")}
                    </p>
                    <div style={{ fontSize: "36px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-1.5px", lineHeight: 1 }}>
                      {form.salary || "—"}
                      <span style={{ fontSize: "16px", fontWeight: 600, color: "#AAAAAA", marginLeft: "6px" }}>
                        {form.rate_type === "percent" ? "%" : form.rate_type === "hourly" ? "₽/ч" : form.salary ? "₽" : ""}
                      </span>
                    </div>
                    <p style={{ fontSize: "12px", color: "#BBBBBB", margin: "6px 0 0" }}>
                      {form.rate_type === "fixed" ? t("staff:editModal.salary.typeFixed")
                        : form.rate_type === "percent" ? t("staff:editModal.salary.typePercent")
                        : form.rate_type === "hourly" ? t("staff:editModal.salary.typeHourly")
                        : t("staff:editModal.salary.typeNotSet")}
                    </p>
                  </div>

                  {/* Type selector */}
                  <div>
                    <FieldLabel>{t("staff:editModal.salary.typeLabel")}</FieldLabel>
                    <div style={{ display: "flex", gap: "8px" }}>
                      {[
                        {
                          id: "fixed", label: t("common:salary.fixed"), sub: t("staff:editModal.salary.cardFixedSub"),
                          icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
                        },
                        {
                          id: "percent", label: t("common:salary.percent"), sub: t("staff:editModal.salary.cardPercentSub"),
                          icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>,
                        },
                        {
                          id: "hourly", label: t("common:salary.hourly"), sub: t("staff:editModal.salary.cardHourlySub"),
                          icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
                        },
                      ].map(({ id, label, sub, icon }) => { // Деструктурируем свойства сразу здесь
                        const isOn = form.rate_type === id;
                        return (
                          <button key={id} type="button" className="ei-salary-type"
                            onClick={() => set("rate_type", id as any)} // id передаем сюда
                            style={{
                              flex: 1, padding: "13px 10px",
                              background: isOn ? "rgba(252,174,145,0.1)" : "rgba(26,26,26,0.02)",
                              border: isOn ? "1.5px solid #FCAE91" : "1.5px solid rgba(26,26,26,0.08)",
                              borderRadius: "12px", cursor: "pointer",
                              fontFamily: "Manrope, sans-serif", transition: "all 0.15s",
                              display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
                            }}
                          >
                            <span style={{ display: "flex", color: isOn ? "#FCAE91" : "#CCCCCC", transition: "color 0.15s" }}>{icon}</span>
                            <span style={{ fontSize: "11px", fontWeight: isOn ? 700 : 600, color: isOn ? "#1A1A1A" : "#888" }}>{label}</span>
                            <span style={{ fontSize: "9.5px", color: isOn ? "#AAAAAA" : "#CCC", fontWeight: 500 }}>{sub}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Amount input */}
                  {form.rate_type && (
                    <div style={{ animation: "eiSlideIn 0.2s ease" }}>
                      <FieldLabel>
                        {form.rate_type === "fixed" ? t("staff:editModal.salary.amountFixed")
                          : form.rate_type === "percent" ? t("staff:editModal.salary.amountPercent")
                          : t("staff:editModal.salary.amountHourly")}
                      </FieldLabel>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ flex: 1, position: "relative" }}>
                          <FocusInput
                            type="number" value={form.salary}
                            onChange={v => set("salary", v)}
                            placeholder={form.rate_type === "percent" ? "25" : form.rate_type === "hourly" ? "500" : "50000"}
                          />
                        </div>
                        <div style={{
                          padding: "11px 16px",
                          background: "rgba(252,174,145,0.1)",
                          border: "1.5px solid rgba(252,174,145,0.25)",
                          borderRadius: "12px", fontSize: "16px", fontWeight: 800, color: "#C07060",
                          flexShrink: 0, minWidth: "50px", textAlign: "center",
                        }}>
                          {form.rate_type === "percent" ? "%" : form.rate_type === "hourly" ? "₽/ч" : "₽"}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tip */}
                  <div style={{
                    padding: "12px 14px", borderRadius: "12px",
                    background: "rgba(163,201,168,0.07)", border: "1px solid rgba(163,201,168,0.2)",
                    display: "flex", gap: "9px", alignItems: "flex-start",
                  }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FCAE91" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }}>
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <p style={{ fontSize: "11.5px", color: "#888", margin: 0, lineHeight: 1.55 }}>
                      {t("staff:editModal.salary.reportHint")}
                    </p>
                  </div>
                </div>
              )}

              {/* ══ TAB: SCHEDULE ══ */}
              {activeTab === "schedule" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {/* Stats row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                    {[
                      { label: t("staff:editModal.schedule.workDaysLabel"), value: `${enabledDays} / 7` },
                      { label: t("staff:editModal.schedule.totalHoursLabel"), value: (() => {
                        let total = 0;
                        Object.values(form.schedule).forEach(d => {
                          if (!d.enabled) return;
                          const [fh, fm] = d.from.split(":").map(Number);
                          const [th, tm] = d.to.split(":").map(Number);
                          total += (th * 60 + tm - fh * 60 - fm);
                        });
                        return `${Math.round(total / 60)}${t("staff:editModal.schedule.hoursSuffix")}`;
                      })() },
                      { label: t("staff:editModal.schedule.daysOffLabel"), value: `${7 - enabledDays}` },
                    ].map(s => (
                      <div key={s.label} style={{
                        padding: "12px 10px", borderRadius: "12px",
                        background: "rgba(26,26,26,0.025)", border: "1.5px solid rgba(26,26,26,0.07)",
                        textAlign: "center",
                      }}>
                        <div style={{ fontSize: "20px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.5px" }}>{s.value}</div>
                        <div style={{ fontSize: "10px", color: "#BBBBBB", fontWeight: 600, marginTop: "2px" }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Schedule rows */}
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
                          {/* Toggle */}
                          <div onClick={() => toggleDay(day.key)} style={{
                            width: "30px", height: "17px", borderRadius: "8.5px",
                            background: d.enabled ? "#FCAE91" : "rgba(26,26,26,0.1)",
                            position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 0.2s",
                          }}>
                            <div style={{
                              position: "absolute", top: "1.5px",
                              left: d.enabled ? "14.5px" : "1.5px",
                              width: "14px", height: "14px", borderRadius: "50%",
                              background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                              transition: "left 0.2s cubic-bezier(0.34,1.2,0.64,1)",
                            }} />
                          </div>

                          {/* Day */}
                          <span style={{
                            width: "94px", fontSize: "12px", flexShrink: 0,
                            fontWeight: d.enabled ? 600 : 400,
                            color: d.enabled ? "#1A1A1A" : "#C0C0C0",
                            transition: "all 0.15s",
                          }}>{t(`common:days.${day.key}`)}</span>

                          {/* Time */}
                          {d.enabled ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "5px", flex: 1 }}>
                              <select value={d.from} onChange={e => updateTime(day.key, "from", e.target.value)} style={selectStyle}>
                                {TIME_OPTIONS.map(t => <option key={t}>{t}</option>)}
                              </select>
                              <span style={{ fontSize: "11px", color: "#CCC", fontWeight: 700 }}>—</span>
                              <select value={d.to} onChange={e => updateTime(day.key, "to", e.target.value)} style={selectStyle}>
                                {TIME_OPTIONS.map(t => <option key={t}>{t}</option>)}
                              </select>
                              {/* Hours badge */}
                              <div style={{
                                marginLeft: "auto",
                                fontSize: "10px", fontWeight: 700, color: "#FCAE91",
                                background: "rgba(252,174,145,0.12)",
                                padding: "2px 7px", borderRadius: "6px",
                              }}>
                                {(() => {
                                  const [fh, fm] = d.from.split(":").map(Number);
                                  const [th, tm] = d.to.split(":").map(Number);
                                  const h = Math.round((th * 60 + tm - fh * 60 - fm) / 60 * 10) / 10;
                                  return `${h}ч`;
                                })()}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#CCC", fontStyle: "italic", flex: 1 }}>{t("staff:schedule.dayOff")}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ── Footer: Save button ── */}
          <div style={{
            padding: "14px 24px 16px",
            borderTop: "1px solid #F0EDE8",
            display: "flex", gap: "10px", alignItems: "center",
            flexShrink: 0,
          }}>
            <button type="button" onClick={onClose} style={{
              padding: "12px 18px",
              background: "transparent", border: "1.5px solid #EEEBE6", borderRadius: "12px",
              fontSize: "13px", fontWeight: 600, color: "#888",
              cursor: "pointer", fontFamily: "Manrope, sans-serif", transition: "all 0.15s",
            }}>
              {t("common:buttons.cancel")}
            </button>

            <button
              type="button"
              className="ei-save"
              disabled={saving || !form.name.trim()}
              onClick={handleSave}
              style={{
                flex: 1, padding: "12px 22px",
                background: saved
                  ? "linear-gradient(135deg, #A3C9A8, #7aab80)"
                  : "linear-gradient(135deg, #FCAE91, #F9A08B)",
                border: "none", borderRadius: "12px",
                fontSize: "14px", fontWeight: 700, color: "white",
                cursor: saving || !form.name.trim() ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                boxShadow: saved ? "0 8px 24px rgba(163,201,168,0.3)" : "0 8px 24px rgba(252,174,145,0.3)",
                transition: "all 0.2s ease", fontFamily: "Manrope, sans-serif",
                opacity: !form.name.trim() ? 0.4 : 1,
                letterSpacing: "-0.1px",
              }}
            >
              {saving ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" style={{ animation: "spin 0.8s linear infinite" }}>
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  {t("common:buttons.saving")}
                </>
              ) : saved ? (
                <span style={{ animation: "eiSavedIn 0.3s cubic-bezier(0.34,1.1,0.64,1)" }}>
                  ✓ {t("common:buttons.saved")}
                </span>
              ) : (
                <>
                  {t("common:buttons.saveChanges")}
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M6 4L10 8L6 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>,
    document.body
  );
}