import React, { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { DAYS_KEYS, TIME_OPTIONS } from "../../constants";
import { servicesApi, type ServiceRead } from "../../../../../api/studio/services.api";
import { settingsApi } from "../../../../../api/settings/settings.api";
import { getCurrencySymbol } from "../../../../../components/UI";
import { useContactCheck } from "../../../../../hooks/useContactCheck";
import { staffApi } from "../../../../../api/staff";
import type { StaffMutateResponse } from "../../../../../api/staff/staff.types";

// ─── TYPES ────────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3 | 4;

interface ScheduleDay { enabled: boolean; from: string; to: string; }

// Телефона здесь нет намеренно: владелец знает только email, а номер сотрудник
// вводит сам на странице приглашения (JoinPage → POST /auth/invite/accept).
interface StaffData {
  name: string; last_name: string; email: string; password: string;
  role: string;
  serviceIds: number[];
  salary: string; rate_type: "fixed" | "percent" | "hourly" | "";
  schedule: Record<string, ScheduleDay>;
}

// 2. Иконки для каждой профессии (в едином минималистичном стиле)
const ROLE_ICONS: Record<string, React.ReactNode> = {
  trainer: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  admin: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
};

const PRESET_ROLES = [
  { id: "trainer" },
  { id: "admin" },
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

// ─── ILLUSTRATIONS ─────────────────────────────────────────────────────────────
function Illus1({ name, contactsLabel, profileLabel }: { name: string; contactsLabel: string; profileLabel: string }) {
  const initials = name.trim().length >= 2
    ? name.trim().split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";
  const hasName = name.trim().length >= 2;
  return (
    <svg viewBox="0 0 260 240" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 260 }}>
      <defs>
        <radialGradient id="i1bg" cx="50%" cy="50%" r="50%"><stop stopColor="rgba(252,174,145,0.12)"/><stop offset="1" stopColor="rgba(252,174,145,0)"/></radialGradient>
        <radialGradient id="i1avatar" cx="40%" cy="35%" r="60%"><stop stopColor="#FCAE91"/><stop offset="1" stopColor="#F07B60"/></radialGradient>
        <filter id="i1shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="rgba(26,26,26,0.10)"/></filter>
        <linearGradient id="i1card" x1="0" y1="0" x2="1" y2="1"><stop stopColor="rgba(255,255,255,1)"/><stop offset="1" stopColor="rgba(253,252,251,1)"/></linearGradient>
      </defs>
      <ellipse cx="130" cy="120" rx="90" ry="80" fill="url(#i1bg)"/>
      <circle cx="32" cy="56" r="5" fill="#FCAE91" opacity="0.3"/>
      <circle cx="228" cy="68" r="3.5" fill="#A3C9A8" opacity="0.4"/>
      <circle cx="220" cy="178" r="5" fill="#FCAE91" opacity="0.25"/>
      <circle cx="44" cy="184" r="3" fill="#A3C9A8" opacity="0.35"/>
      <rect x="36" y="50" width="188" height="142" rx="20" fill="url(#i1card)" filter="url(#i1shadow)" stroke="#F0EDE8" strokeWidth="1"/>
      <rect x="36" y="50" width="188" height="60" rx="20" fill="rgba(252,174,145,0.04)"/>
      <rect x="36" y="90" width="188" height="20" fill="rgba(252,174,145,0.04)"/>
      <circle cx="130" cy="102" r="28" fill={hasName ? "url(#i1avatar)" : "rgba(var(--ink),0.06)"}/>
      {hasName ? (
        <text x="130" y="109" textAnchor="middle" fontSize="14" fontWeight="800" fill="white" fontFamily="Manrope, sans-serif">{initials}</text>
      ) : (
        <>
          <circle cx="130" cy="97" r="8" fill="rgba(var(--ink),0.15)"/>
          <path d="M114 116 Q130 109 146 116" stroke="rgba(var(--ink),0.15)" strokeWidth="3" strokeLinecap="round" fill="none"/>
        </>
      )}
      <circle cx="152" cy="82" r="7" fill="white"/>
      <circle cx="152" cy="82" r="4.5" fill="#A3C9A8"/>
      {hasName ? (
        <text x="130" y="148" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1A1A1A" fontFamily="Manrope, sans-serif">{name.split(" ")[0]}</text>
      ) : (
        <rect x="88" y="141" width="84" height="8" rx="4" fill="rgba(var(--ink),0.08)"/>
      )}
      <rect x="100" y="155" width="60" height="5" rx="2.5" fill="rgba(var(--ink),0.05)"/>
      <rect x="52" y="172" width="72" height="12" rx="6" fill="rgba(252,174,145,0.15)" stroke="rgba(252,174,145,0.3)" strokeWidth="1"/>
      <text x="88" y="181.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#D07A5A" fontFamily="Manrope, sans-serif">{contactsLabel}</text>
      <rect x="132" y="172" width="72" height="12" rx="6" fill="rgba(163,201,168,0.15)" stroke="rgba(163,201,168,0.3)" strokeWidth="1"/>
      <text x="168" y="181.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#5A8A60" fontFamily="Manrope, sans-serif">{profileLabel}</text>
      <circle cx="208" cy="62" r="13" fill="white" stroke="#F0EDE8" strokeWidth="1" filter="url(#i1shadow)"/>
      <path d="M203 65 L207 61 L211 65 L207 69 Z" fill="rgba(249,160,139,0.8)"/>
    </svg>
  );
}

function Illus2({ role, roleLabel, servicesLabel, specializationLabel, roleChips }: {
  role: string; roleLabel: string; servicesLabel: string; specializationLabel: string;
  roleChips: Array<{ label: string }>;
}) {
  const CHIP_LAYOUT = [
    { x: 28, y: 52, opacity: 0.4 },
    { x: 168, y: 44, opacity: 0.4 },
    { x: 20, y: 168, opacity: 0.35 },
    { x: 172, y: 172, opacity: 0.35 },
  ];
  return (
    <svg viewBox="0 0 260 240" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 260 }}>
      <defs>
        <radialGradient id="i2bg" cx="50%" cy="50%" r="50%"><stop stopColor="rgba(163,201,168,0.1)"/><stop offset="1" stopColor="rgba(163,201,168,0)"/></radialGradient>
        <filter id="i2shadow"><feDropShadow dx="0" dy="6" stdDeviation="12" floodColor="rgba(var(--ink),0.08)"/></filter>
        <linearGradient id="i2accent" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#FCAE91"/><stop offset="1" stopColor="#F9A08B"/></linearGradient>
      </defs>
      <ellipse cx="130" cy="120" rx="85" ry="75" fill="url(#i2bg)"/>
      {roleChips.map((chip, i) => {
        const pos = CHIP_LAYOUT[i];
        return (
          <g key={i} opacity={pos.opacity}>
            <rect x={pos.x} y={pos.y} width="64" height="26" rx="13" fill="rgba(var(--ink),0.04)" stroke="#EEEBE6" strokeWidth="1"/>
            <text x={pos.x + 32} y={pos.y + 17} textAnchor="middle" fontSize="8" fontWeight="600" fill="#999" fontFamily="Manrope, sans-serif">{chip.label}</text>
          </g>
        );
      })}
      <rect x="62" y="80" width="136" height="82" rx="18" fill="white" filter="url(#i2shadow)" stroke="#F0EDE8" strokeWidth="1"/>
      <rect x="62" y="80" width="136" height="82" rx="18" fill="rgba(252,174,145,0.03)"/>
      <circle cx="130" cy="108" r="22" fill="url(#i2accent)" opacity={role ? 1 : 0.3}/>
      <g transform="translate(121, 99)" style={{ color: "white" }}>
        {ROLE_ICONS[role] || <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/></svg>}
      </g>
      {role ? (
        <text x="130" y="148" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1A1A1A" fontFamily="Manrope, sans-serif">{roleLabel}</text>
      ) : (
        <rect x="96" y="141" width="68" height="8" rx="4" fill="rgba(var(--ink),0.07)"/>
      )}
      {role && (
        <g>
          <circle cx="162" cy="84" r="10" fill="url(#i2accent)"/>
          <path d="M157 84 L161 88 L167 80" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </g>
      )}
      <rect x="72" y="174" width="48" height="12" rx="6" fill="rgba(163,201,168,0.18)"/>
      <rect x="126" y="174" width="64" height="12" rx="6" fill="rgba(163,201,168,0.18)"/>
      <text x="96" y="183.5" textAnchor="middle" fontSize="7" fontWeight="700" fill="#6A9E72" fontFamily="Manrope, sans-serif">{servicesLabel}</text>
      <text x="158" y="183.5" textAnchor="middle" fontSize="7" fontWeight="700" fill="#6A9E72" fontFamily="Manrope, sans-serif">{specializationLabel}</text>
      <circle cx="46" cy="112" r="4" fill="#FCAE91" opacity="0.3"/>
      <circle cx="214" cy="108" r="3" fill="#A3C9A8" opacity="0.4"/>
    </svg>
  );
}

function Illus3({ schedule, dayAbbrs, scheduleTitle, workDaysText }: {
  schedule: Record<string, ScheduleDay>;
  dayAbbrs: string[];
  scheduleTitle: string;
  workDaysText: string;
}) {
  const keys = ["mon","tue","wed","thu","fri","sat","sun"];
  return (
    <svg viewBox="0 0 260 240" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 260 }}>
      <defs>
        <filter id="i3shadow"><feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="rgba(var(--ink),0.09)"/></filter>
        <linearGradient id="i3grad" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#FCAE91"/><stop offset="1" stopColor="#A3C9A8"/></linearGradient>
        <radialGradient id="i3bg" cx="50%" cy="50%" r="50%"><stop stopColor="rgba(163,201,168,0.09)"/><stop offset="1" stopColor="rgba(163,201,168,0)"/></radialGradient>
      </defs>
      <ellipse cx="130" cy="120" rx="88" ry="78" fill="url(#i3bg)"/>
      <rect x="32" y="42" width="196" height="148" rx="20" fill="white" filter="url(#i3shadow)" stroke="#F0EDE8" strokeWidth="1"/>
      <rect x="32" y="42" width="196" height="32" rx="20" fill="rgba(252,174,145,0.1)"/>
      <rect x="32" y="60" width="196" height="14" fill="rgba(252,174,145,0.1)"/>
      <text x="130" y="62" textAnchor="middle" fontSize="9" fontWeight="800" fill="#C07060" fontFamily="Manrope, sans-serif" letterSpacing="1">{scheduleTitle}</text>
      {dayAbbrs.map((d, i) => (
        <text key={i} x={52 + i * 26} y={92} textAnchor="middle" fontSize="8" fontWeight="700" fill="#BBBBBB" fontFamily="Manrope, sans-serif">{d}</text>
      ))}
      {keys.map((key, i) => {
        const enabled = schedule[key]?.enabled ?? false;
        const cx = 52 + i * 26;
        return (
          <g key={key}>
            <rect x={cx - 10} y={100} width={20} height={20} rx={6}
              fill={enabled ? "rgba(252,174,145,0.5)" : "rgba(var(--ink),0.04)"}
              stroke={enabled ? "rgba(252,174,145,0.8)" : "transparent"} strokeWidth="1.2"/>
            {enabled && <path d={`M${cx - 4} 110 L${cx} 114 L${cx + 5} 106`} stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>}
          </g>
        );
      })}
      {keys.map((key, i) => {
        const d = schedule[key];
        if (!d?.enabled) return null;
        const cx = 52 + i * 26;
        return <rect key={key} x={cx - 9} y={128} width={18} height={4} rx={2} fill="rgba(252,174,145,0.3)"/>;
      })}
      <rect x="50" y="146" width="160" height="28" rx="10" fill="url(#i3grad)" opacity="0.85"/>
      <text x="130" y="163" textAnchor="middle" fontSize="9" fontWeight="800" fill="white" fontFamily="Manrope, sans-serif" letterSpacing="0.5">
        {workDaysText}
      </text>
      <circle cx="40" cy="50" r="4" fill="#FCAE91" opacity="0.45"/>
      <circle cx="220" cy="50" r="4" fill="#FCAE91" opacity="0.45"/>
      <circle cx="42" cy="188" r="3" fill="#A3C9A8" opacity="0.4"/>
      <circle cx="218" cy="188" r="3" fill="#A3C9A8" opacity="0.4"/>
    </svg>
  );
}

function Illus4({ inviteSentLabel, inviteSubText }: { inviteSentLabel: string; inviteSubText: string }) {
  return (
    <svg viewBox="0 0 260 240" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 260 }}>
      <defs>
        <radialGradient id="i4glow" cx="50%" cy="45%" r="50%"><stop stopColor="rgba(163,201,168,0.2)"/><stop offset="1" stopColor="rgba(163,201,168,0)"/></radialGradient>
        <linearGradient id="i4green" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#A3C9A8"/><stop offset="1" stopColor="#7aab80"/></linearGradient>
        <linearGradient id="i4peach" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#FCAE91"/><stop offset="1" stopColor="#F9A08B"/></linearGradient>
        <filter id="i4shadow"><feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="rgba(26,26,26,0.1)"/></filter>
      </defs>
      <ellipse cx="130" cy="100" rx="80" ry="72" fill="url(#i4glow)"/>
      {[
        { x:64,  y:58,  r:5,   fill:"#FCAE91", op:0.5 },
        { x:196, y:50,  r:4,   fill:"#A3C9A8", op:0.5 },
        { x:210, y:84,  r:3,   fill:"#FCAE91", op:0.4 },
        { x:48,  y:90,  r:3,   fill:"#A3C9A8", op:0.4 },
        { x:74,  y:182, r:4,   fill:"#A3C9A8", op:0.35 },
        { x:186, y:176, r:4.5, fill:"#FCAE91", op:0.35 },
        { x:224, y:148, r:3,   fill:"#A3C9A8", op:0.3 },
        { x:36,  y:154, r:3.5, fill:"#FCAE91", op:0.3 },
      ].map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.fill} opacity={d.op}/>
      ))}
      <circle cx="130" cy="94" r="38" fill="rgba(163,201,168,0.12)"/>
      <circle cx="130" cy="94" r="28" fill="white" filter="url(#i4shadow)" stroke="#F0EDE8" strokeWidth="1"/>
      <circle cx="130" cy="94" r="28" fill="rgba(163,201,168,0.06)"/>
      <path d="M117 94 L126 103 L143 82" stroke="url(#i4green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="44" y="144" width="172" height="52" rx="16" fill="white" filter="url(#i4shadow)" stroke="#F0EDE8" strokeWidth="1"/>
      <circle cx="66" cy="170" r="12" fill="rgba(37,211,102,0.12)"/>
      <path d="M62 170 L66 174 L71 165" stroke="#25d366" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <text x="84" y="164" fontSize="9" fontWeight="700" fill="#1A1A1A" fontFamily="Manrope, sans-serif">{inviteSentLabel}</text>
      <text x="84" y="178" fontSize="8" fontWeight="500" fill="#AAAAAA" fontFamily="Manrope, sans-serif">{inviteSubText}</text>
      <path d="M200 170 L205 170 M202 167 L205 170 L202 173" stroke="#CCCCCC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────
function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
      <div style={{
        width: "30px", height: "30px", borderRadius: "9px", flexShrink: 0,
        background: "linear-gradient(135deg, #FCAE91, #F9A08B)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 10px rgba(252,174,145,0.35)",
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2C9.5 2 7 4.5 7 7.5c0 3.5 2 6.5 5 8.5 3-2 5-5 5-8.5C17 4.5 14.5 2 12 2z"/>
        </svg>
      </div>
      <span style={{ fontSize: "15px", fontWeight: 900, color: "var(--onyx)", letterSpacing: "-0.4px", fontFamily: "Manrope, sans-serif" }}>
        velora
      </span>
    </div>
  );
}

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i + 1 === current ? "22px" : "6px", height: "6px",
          borderRadius: "3px",
          background: i + 1 <= current ? "#FCAE91" : "rgba(var(--ink),0.1)",
          transition: "all 0.3s cubic-bezier(0.34,1.1,0.64,1)",
        }}/>
      ))}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: "block", fontSize: "11px", fontWeight: 700, color: "var(--text3)",
      letterSpacing: "0.6px", textTransform: "uppercase" as const, marginBottom: "7px",
    }}>
      {children}
    </label>
  );
}

function FocusInput({ value, onChange, placeholder, type = "text", onKeyDown, error, hint }: {
  value: string; onChange: (v: string) => void; placeholder: string;
  type?: string; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  error?: string; hint?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{
          width: "100%", padding: "12px 15px",
          background: focused ? "var(--bg-card)" : "rgba(var(--ink),0.025)",
          border: error ? "1.5px solid #D88C9A" : focused ? "1.5px solid #FCAE91" : "1.5px solid rgba(var(--ink),0.09)",
          borderRadius: "12px", fontSize: "14px", fontWeight: 500, color: "var(--onyx)",
          outline: "none", fontFamily: "Manrope, sans-serif",
          boxShadow: error ? "0 0 0 3px rgba(216,140,154,0.14)" : focused ? "0 0 0 3px rgba(252,174,145,0.14)" : "none",
          transition: "all 0.18s ease", boxSizing: "border-box" as const,
        }}
      />
      {error && (
        <p style={{ fontSize: "11px", color: "#D88C9A", margin: "6px 0 0", fontWeight: 500 }}>{error}</p>
      )}
      {!error && hint && (
        <p style={{ fontSize: "11px", color: "#AAAAAA", margin: "6px 0 0", fontWeight: 500 }}>{hint}</p>
      )}
    </div>
  );
}

// ─── MAIN MODAL ───────────────────────────────────────────────────────────────
export interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Возвращает созданного сотрудника: шаг 4 показывает НАСТОЯЩУЮ ссылку-приглашение,
  // поэтому запись должна быть создана до него, а не по кнопке «Готово».
  onSuccess?: (data: StaffData) => Promise<StaffMutateResponse | void>;
}

export function AddEmployeeModal({ isOpen, onClose, onSuccess }: AddEmployeeModalProps) {
  const { t } = useTranslation(["staff", "common"]);
  const navigate = useNavigate();
  const [step, setStep]       = useState<Step>(1);
  const [animating, setAnimating] = useState(false);
  const [dir, setDir]         = useState<1 | -1>(1);
  const [showCatalogConfirm, setShowCatalogConfirm] = useState(false);
  const [availableServices, setAvailableServices] = useState<ServiceRead[]>([]);
  const [currency, setCurrency] = useState<string>();

  // Результат создания: id нужен для повторной отправки письма, ссылка — чтобы
  // владелец мог передать её сотруднику руками, если почта не дошла. Email берём
  // с ответа, а не из формы: человека с этим телефоном могли привязать к уже
  // существующему аккаунту, и письмо ушло на ЕГО адрес (ROADMAP_ACCOUNTS, решение 8).
  const [created, setCreated] = useState<{
    id: number; email: string; inviteUrl: string;
  } | null>(null);
  const [saving, setSaving]   = useState(false);
  const [copied, setCopied]   = useState(false);
  const [resent, setResent]   = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    if (isOpen) {
      servicesApi.list().then(setAvailableServices).catch(() => setAvailableServices([]));
      settingsApi.getGeneral().then(s => setCurrency(s.currency ?? undefined)).catch(() => {});
    }
  }, [isOpen]);

  const currencySymbol = getCurrencySymbol(currency);

  const [data, setData] = useState<StaffData>({
    name: "", last_name: "", email: "", password: "",
    role: "", serviceIds: [],
    salary: "", rate_type: "fixed",
    schedule: { ...defaultSchedule },
  });

  const set = useCallback(<K extends keyof StaffData>(k: K, v: StaffData[K]) => {
    setData(d => ({ ...d, [k]: v }));
  }, []);

  function goNext() {
    if (animating) return;
    setDir(1); setAnimating(true);
    setTimeout(() => { setStep(s => Math.min(s + 1, 4) as Step); setAnimating(false); }, 200);
  }

  function goBack() {
    if (animating || step === 1) return;
    setDir(-1); setAnimating(true);
    setTimeout(() => { setStep(s => Math.max(s - 1, 1) as Step); setAnimating(false); }, 200);
  }

  function handleClose() {
    setStep(1);
    setShowCatalogConfirm(false);
    setCreated(null);
    setCopied(false);
    setResent("idle");
    setData({ name: "", last_name: "", email: "", password: "", role: "", serviceIds: [], salary: "", rate_type: "fixed", schedule: { ...defaultSchedule } });
    onClose();
  }

  // Создание — на шаге 3, а не по кнопке «Готово»: шаг 4 показывает реальную
  // ссылку-приглашение, а её выдаёт бэкенд только вместе с созданным сотрудником.
  async function handleCreate() {
    if (saving) return;
    setSaving(true);
    try {
      const result = await onSuccess?.({ ...data, serviceIds: data.role === "trainer" ? data.serviceIds : [] });
      if (result) setCreated({
        id: result.staff.id,
        email: result.staff.email,
        inviteUrl: result.invite_url ?? "",
      });
      goNext();
    } catch {
      // Ошибка уже показана тостом выше по стеку (Staff.tsx onSuccess) — остаёмся на шаге 3.
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    if (!created?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(created.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Буфер обмена недоступен (http без localhost) — ссылка видна и её можно выделить.
    }
  }

  async function handleResend() {
    if (!created || resent === "sending") return;
    setResent("sending");
    try {
      const result = await staffApi.resendInvite(created.id);
      // Ссылка новая: у прежней свой срок жизни, и переиспользовать её нельзя.
      setCreated({ ...created, inviteUrl: result.invite_url ?? created.inviteUrl });
      setResent("sent");
    } catch {
      setResent("error");
    }
  }

  function toggleDay(key: string) {
    set("schedule", { ...data.schedule, [key]: { ...data.schedule[key], enabled: !data.schedule[key].enabled } });
  }

  function updateDayTime(key: string, field: "from" | "to", val: string) {
    set("schedule", { ...data.schedule, [key]: { ...data.schedule[key], [field]: val } });
  }

  function toggleService(serviceId: number) {
    set("serviceIds", data.serviceIds.includes(serviceId)
      ? data.serviceIds.filter(id => id !== serviceId)
      : [...data.serviceIds, serviceId]);
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emailFormatOk = EMAIL_RE.test(data.email.trim());

  // Email уже принадлежит аккаунту Velora — это тот же человек, и он будет
  // привязан к студии (имя и фото владелец задаёт свои, они студийные). Ошибка
  // ровно одна: человек уже в этой команде.
  const emailCheck = useContactCheck("staff", "email", data.email, { enabled: isOpen && emailFormatOk });
  const willLinkAccount = emailCheck.taken && !emailCheck.inStudio;

  const nameError     = data.name.trim().length > 0 && data.name.trim().length < 2 ? t("addModal.step1.errors.name") : undefined;
  const emailError    = data.email.trim().length > 0 && !emailFormatOk ? t("addModal.step1.errors.email")
    : emailCheck.inStudio ? t("common:validation.emailInStudio") : undefined;
  // Требования — те же, что у бэкенда (validate_strong_password): это настоящий
  // пароль от аккаунта сотрудника, а не одноразовый код. У привязываемого
  // аккаунта пароль уже свой — тогда поле не показываем вовсе.
  const passwordStrongOk = data.password.length >= 8
    && /[A-Za-zА-Яа-я]/.test(data.password) && /[0-9]/.test(data.password);
  const passwordError = data.password.length > 0 && !passwordStrongOk
    ? t("addModal.step1.errors.password") : undefined;
  const checkingHint  = t("common:validation.checkingContact");

  const effectiveRole    = t(`staff:roles.${data.role}`, { defaultValue: data.role });
  const canStep1         = data.name.trim().length >= 2
    && emailFormatOk
    && (willLinkAccount || passwordStrongOk)
    && !nameError && !emailError
    && !emailCheck.checking;
  const canStep2         = data.role.trim().length >= 2;
  const canStep3         = Object.values(data.schedule).some(d => d.enabled);
  const enabledDays      = Object.values(data.schedule).filter(d => d.enabled).length;

  const DAYS_ORDER = ["mon","tue","wed","thu","fri","sat","sun"];
  const dayAbbrs   = DAYS_ORDER.map(k => t(`common:days.short.${k}`));
  const roleChips  = [
    { label: t("staff:roles.trainer") },
    { label: t("staff:roles.admin") },
  ];

  const selectStyle: React.CSSProperties = {
    padding: "7px 10px", 
    background: "var(--bg-card)",
    border: "1.5px solid rgba(var(--ink),0.12)", 
    borderRadius: "8px",
    fontSize: "12px", 
    fontWeight: 700, 
    color: "var(--onyx)", 
    outline: "none",
    fontFamily: "Manrope, sans-serif", 
    cursor: "pointer", 
    width: "78px",
    appearance: "none" as const,
    textAlign: "center",
    boxShadow: "0 2px 6px rgba(26,26,26,0.02)",
  };

  if (!isOpen) return null;

  const stepMeta = [
    { title: t("addModal.steps.1.title"), sub: t("addModal.steps.1.sub"),   trustLabel: t("addModal.steps.1.trust") },
    { title: t("addModal.steps.2.title"), sub: t("addModal.steps.2.sub"),   trustLabel: t("addModal.steps.2.trust") },
    { title: t("addModal.steps.3.title"), sub: t("addModal.steps.3.sub"),   trustLabel: t("addModal.steps.3.trust") },
    { title: t("addModal.steps.4.title"), sub: t("addModal.steps.4.sub", { name: data.name.split(" ")[0] || t("addModal.nameFallback") }), trustLabel: "" },
  ];
  const current = stepMeta[step - 1];

  return createPortal(
    <div className="v-overlay" onClick={handleClose}>
      <style>{`
        @keyframes modalIn   { from { opacity:0; transform: scale(0.93) translateY(20px) } to { opacity:1; transform: scale(1) translateY(0) } }
        @keyframes stepIn    { from { opacity:0; transform: translateX(${dir === 1 ? 24 : -24}px) } to { opacity:1; transform: translateX(0) } }
        @keyframes pulse2    { 0%,100% { opacity:1; transform:scale(1) } 50% { opacity:0.5; transform:scale(1.5) } }
        @keyframes checkpop  { from { transform: scale(0.6); opacity:0 } to { transform: scale(1); opacity:1 } }
        .as-role-card { transition: all 0.18s cubic-bezier(0.34,1.1,0.64,1); }
        .as-role-card:hover { border-color: #FCAE91 !important; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(252,174,145,0.15) !important; }
        .as-svc-pill { transition: all 0.15s ease; cursor: pointer; }
        .as-svc-pill:hover { border-color: rgba(252,174,145,0.6) !important; background: rgba(252,174,145,0.08) !important; }
        .as-sched-row { transition: background 0.15s; }
        .as-sched-row:hover { background: rgba(252,174,145,0.03) !important; }
        .as-close-btn:hover { background: rgba(var(--ink),0.1) !important; }
        .as-back-btn:hover  { background: rgba(var(--ink),0.04) !important; border-color: var(--border2) !important; }
        .as-scroll::-webkit-scrollbar { width: 3px; }
        .as-scroll::-webkit-scrollbar-thumb { background: rgba(249,160,139,0.25); border-radius: 3px; }
        .as-role-card { transition: all 0.25s cubic-bezier(0.34, 1.1, 0.64, 1); }
        .as-role-card:hover { 
          border-color: rgba(var(--ink), 0.15) !important; 
          transform: translateY(-2px); 
          box-shadow: 0 8px 24px rgba(26, 26, 26, 0.06) !important; 
        }

        .as-svc-pill { transition: all 0.2s ease; cursor: pointer; }
        .as-svc-pill:hover { 
          border-color: var(--onyx) !important; 
          background: var(--bg-card) !important; 
          color: var(--onyx) !important; 
        }

        .as-add-svc-btn { transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1); }
        .as-add-svc-btn:hover { 
          border: 1.5px solid var(--onyx) !important; 
          background: var(--bg-card) !important; 
          color: var(--onyx) !important; 
          transform: translateY(-2px); 
          box-shadow: 0 8px 20px rgba(26, 26, 26, 0.08); 
        }
          .as-time-select { transition: all 0.2s ease; }
        .as-time-select:hover, .as-time-select:focus {
          border-color: var(--onyx) !important;
          box-shadow: 0 4px 12px rgba(26, 26, 26, 0.08) !important;
        }
      `}</style>

      <div
        style={{
          width: "100%", maxWidth: "860px", height: "min(596px, calc(100vh - 32px))",
          background: "var(--bg)", borderRadius: "24px",
          boxShadow: "0 40px 100px rgba(26,26,26,0.18), 0 8px 32px rgba(26,26,26,0.07)",
          display: "grid", gridTemplateColumns: "280px 1fr",
          overflow: "hidden", animation: "modalIn 0.3s ease",
        }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── LEFT PANEL ── */}
        <div style={{
          background: "var(--bg-card)", padding: "36px 30px 28px",
          display: "flex", flexDirection: "column",
          borderRight: "1px solid #F0EDE8",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: `
              radial-gradient(circle at 15% 15%, rgba(252,174,145,0.07) 0%, transparent 55%),
              radial-gradient(circle at 85% 85%, rgba(163,201,168,0.07) 0%, transparent 55%)
            `,
          }}/>

          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ marginBottom: "28px" }}><Logo/></div>
            <p style={{ fontSize: "10px", fontWeight: 700, color: "#FCAE91", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 6px" }}>
              {t("addModal.stepIndicator", { current: step, total: 4 })}
            </p>
            <h2 style={{ fontSize: "19px", fontWeight: 900, color: "var(--onyx)", letterSpacing: "-0.6px", lineHeight: 1.25, margin: "0 0 6px" }}>
              {current.title}
            </h2>
            <p style={{ fontSize: "12px", color: "var(--text3)", lineHeight: 1.55, margin: "0 0 16px" }}>
              {current.sub}
            </p>
            <StepDots current={step} total={4}/>
          </div>

          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 0", position: "relative", zIndex: 1 }}>
            {step === 1 && <Illus1
              name={data.name}
              contactsLabel={t("addModal.illus.contacts")}
              profileLabel={t("addModal.illus.profile")}
            />}
            {step === 2 && <Illus2
              role={data.role}
              roleLabel={t(`staff:roles.${data.role}`, { defaultValue: t("addModal.illus.roleFallback") })}
              servicesLabel={t("addModal.illus.services")}
              specializationLabel={t("addModal.illus.specialization")}
              roleChips={roleChips}
            />}
            {step === 3 && <Illus3
              schedule={data.schedule}
              dayAbbrs={dayAbbrs}
              scheduleTitle={t("addModal.illus.scheduleTitle")}
              workDaysText={t("staff:schedule.workDaysInWeek", { count: enabledDays })}
            />}
            {step === 4 && <Illus4
              inviteSentLabel={t("addModal.illus.inviteSent")}
              inviteSubText={t("addModal.illus.inviteSub", { name: data.name.split(" ")[0] || t("addModal.employeeFallback") })}
            />}
          </div>

          <div style={{
            padding: "11px 13px",
            background: step === 4 ? "rgba(163,201,168,0.1)" : "rgba(163,201,168,0.08)",
            borderRadius: "10px", position: "relative", zIndex: 1,
          }}>
            {step < 4 ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#A3C9A8", flexShrink: 0, animation: "pulse2 2.2s infinite" }}/>
                <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 500 }}>{current.trustLabel}</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {[
                  { l: t("addModal.summary.employee"), v: data.name },
                  { l: t("addModal.summary.role"),     v: effectiveRole },
                  { l: t("addModal.summary.workDays"), v: t("addModal.summary.daysCount", { count: enabledDays }) },
                ].map(row => (
                  <div key={row.l} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "11px", color: "#AAAAAA" }}>{row.l}</span>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--onyx)" }}>{row.v || "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{ padding: "16px 30px 24px", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
          <button className="as-close-btn" onClick={handleClose} style={{
            position: "absolute", top: "14px", right: "14px",
            width: "28px", height: "28px",
            background: "rgba(var(--ink),0.05)", border: "none",
            borderRadius: "8px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#AAA", transition: "background 0.15s", flexShrink: 0,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          <div className="as-scroll" style={{ flex: 1, overflowY: "auto", paddingRight: "4px", marginTop: "28px" }}>
            <div key={step} style={{ animation: "stepIn 0.25s cubic-bezier(0.34,1.1,0.64,1)" }}>

              {/* ── STEP 1 ── */}
              {step === 1 && (
                <div>
                  <h3 style={{ fontSize: "20px", fontWeight: 900, color: "var(--onyx)", letterSpacing: "-0.6px", margin: "0 0 4px" }}>{t("addModal.step1.heading")}</h3>
                  <p style={{ fontSize: "12px", color: "#AAA", margin: "0 0 24px" }}>{t("addModal.step1.sub")}</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div>
                      <FieldLabel>{t("common:fields.fullName")} *</FieldLabel>
                      <FocusInput value={data.name} onChange={v => set("name", v)} placeholder={t("addModal.step1.namePlaceholder")} error={nameError}/>
                    </div>
                    <div>
                      <FieldLabel>{t("addModal.step1.emailLabel")} *</FieldLabel>
                      <FocusInput type="email" value={data.email} onChange={v => set("email", v)} placeholder="anna@velora.studio" error={emailError} hint={emailCheck.checking ? checkingHint : undefined}/>
                    </div>
                    {/* Пароль задаёт владелец и передаёт сотруднику лично: письмо
                        даёт только ссылку, и без пароля она не откроет студию.
                        У существующего аккаунта пароль свой — поле прячем, чтобы
                        владелец не задавал его человеку, который в продукте уже есть. */}
                    {willLinkAccount ? (
                      <div style={{ padding: "12px 14px", background: "rgba(163,201,168,0.1)", borderRadius: "12px", border: "1px solid rgba(163,201,168,0.28)", display: "flex", gap: "9px", alignItems: "flex-start", animation: "stepIn 0.25s ease" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7aab80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }}>
                          <path d="M20 6L9 17l-5-5"/>
                        </svg>
                        <p style={{ fontSize: "11.5px", color: "#5f7f65", margin: 0, lineHeight: 1.55 }}>
                          {t("common:validation.accountWillBeLinked")}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <FieldLabel>{t("addModal.step1.passwordLabel")} *</FieldLabel>
                        <FocusInput type="password" value={data.password} onChange={v => set("password", v)} placeholder={t("addModal.step1.passwordPlaceholder")} error={passwordError}/>
                      </div>
                    )}
                    {data.name.trim().length >= 2 && (
                      <div style={{
                        padding: "13px 15px",
                        background: "linear-gradient(135deg, rgba(252,174,145,0.07), rgba(163,201,168,0.05))",
                        borderRadius: "14px", border: "1.5px solid rgba(252,174,145,0.2)",
                        display: "flex", alignItems: "center", gap: "12px",
                        animation: "stepIn 0.25s ease",
                      }}>
                        <div style={{
                          width: "40px", height: "40px", borderRadius: "12px", flexShrink: 0,
                          background: "linear-gradient(135deg, #FCAE91, #F9A08B)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "14px", fontWeight: 800, color: "white",
                          boxShadow: "0 4px 12px rgba(252,174,145,0.3)",
                        }}>
                          {data.name.trim().split(" ").map(w => w[0]).slice(0,2).join("").toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{data.name}</div>
                          <div style={{ fontSize: "11px", color: "#AAA", marginTop: "2px" }}>{data.email || t("addModal.step1.contactsNotSet")}</div>
                        </div>
                        <div style={{ padding: "3px 8px", borderRadius: "6px", background: "rgba(163,201,168,0.18)", fontSize: "9px", fontWeight: 700, color: "#5A8A60", letterSpacing: "0.5px" }}>{t("common:status.new")}</div>
                      </div>
                    )}
                    <div style={{ padding: "11px 14px", background: "rgba(252,174,145,0.06)", borderRadius: "12px", border: "1px solid rgba(252,174,145,0.18)", display: "flex", gap: "9px", alignItems: "flex-start" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FCAE91" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "1px" }}>
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <p style={{ fontSize: "11.5px", color: "var(--text3)", margin: 0, lineHeight: 1.55 }}>
                        {t("addModal.step1.inviteHint")}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 2 ── */}
              {step === 2 && (
                <div>
                  <h3 style={{ fontSize: "20px", fontWeight: 900, color: "var(--onyx)", letterSpacing: "-0.6px", margin: "0 0 4px" }}>{t("addModal.step2.heading")}</h3>
                  <p style={{ fontSize: "12px", color: "#AAA", margin: "0 0 24px" }}>{t("addModal.step2.sub")}</p>
                  
                  <div style={{ marginBottom: "20px" }}>
                    <FieldLabel>{t("addModal.step2.positionLabel")}</FieldLabel>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "16px" }}>
                      {PRESET_ROLES.map(r => {
                        const isSelected = data.role === r.id;
                        return (
                          <button key={r.id} type="button" className="as-role-card"
                            onClick={() => set("role", data.role === r.id ? "" : r.id)}
                            style={{
                              padding: "14px 8px", // Чуть больше воздуха для премиальности
                              background: isSelected ? "rgba(var(--ink),0.02)" : "var(--bg-card)",
                              border: isSelected ? "1.5px solid var(--onyx)" : "1.5px solid rgba(var(--ink),0.08)",
                              borderRadius: "12px", cursor: "pointer",
                              display: "flex", flexDirection: "column", alignItems: "center", gap: "6px",
                              boxShadow: isSelected ? "0 4px 16px rgba(26,26,26,0.04)" : "none",
                              fontFamily: "Manrope, sans-serif", position: "relative",
                            }}
                          >
                            {isSelected && (
                              <div style={{
                                position: "absolute", top: "6px", right: "6px",
                                width: "14px", height: "14px",
                                background: "var(--onyx)", borderRadius: "50%",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                animation: "checkpop 0.25s cubic-bezier(0.34,1.1,0.64,1)",
                              }}>
                                <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4 L3 5.5 L6.5 2" stroke="var(--bg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              </div>
                            )}
                            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", color: isSelected ? "var(--onyx)" : "var(--text3)", transition: "color 0.18s" }}>
                              {ROLE_ICONS[r.id]}
                            </span>
                            <span style={{ fontSize: "10px", fontWeight: isSelected ? 800 : 600, color: isSelected ? "var(--onyx)" : "var(--text3)", textAlign: "center", lineHeight: 1.2 }}>
                              {t(`staff:roles.${r.id}`)}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {data.role === "trainer" && (
                      <div style={{ animation: "stepIn 0.25s ease" }}>
                        <FieldLabel>{t("common:fields.services")}</FieldLabel>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                          {availableServices.map(service => {
                            const isSelected = data.serviceIds.includes(service.id);
                            return (
                              <button key={service.id} type="button" className="as-svc-pill"
                                onClick={() => toggleService(service.id)}
                                style={{
                                  padding: "8px 14px", borderRadius: "20px", cursor: "pointer",
                                  background: isSelected ? "var(--onyx)" : "rgba(var(--ink),0.02)",
                                  border: isSelected ? "1.5px solid var(--onyx)" : "1.5px solid rgba(var(--ink),0.08)",
                                  color: isSelected ? "var(--bg)" : "var(--muted)", fontSize: "12px",
                                  fontWeight: isSelected ? 700 : 600, fontFamily: "Manrope, sans-serif",
                                  display: "flex", alignItems: "center", gap: "6px"
                                }}
                              >
                                {isSelected && (
                                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                    <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                )}
                                {service.name}
                              </button>
                            );
                          })}
                        </div>
                        <div style={{ width: "100%" }}>
                          {!showCatalogConfirm && (
                            <button type="button" className="as-add-svc-btn" onClick={() => setShowCatalogConfirm(true)} style={{
                              padding: "8px 14px", borderRadius: "20px", cursor: "pointer",
                              background: "transparent", border: "1.5px dashed rgba(var(--ink),0.2)",
                              color: "var(--text3)", fontSize: "12px", fontWeight: 600, fontFamily: "Manrope, sans-serif",
                              transition: "border-color 0.2s ease, color 0.2s ease, transform 0.2s ease",
                            }}>
                              + {t("staff:editModal.role.addService")}
                            </button>
                          )}
                          <div aria-hidden={!showCatalogConfirm} style={{
                            maxHeight: showCatalogConfirm ? "160px" : "0", opacity: showCatalogConfirm ? 1 : 0,
                            overflow: "hidden", transform: showCatalogConfirm ? "translateY(0)" : "translateY(-8px)",
                            transition: "max-height 0.3s ease, opacity 0.2s ease, transform 0.3s ease",
                          }}>
                            
                            {/* 🔥 Новый премиальный дизайн подтверждения */}
                            <div style={{
                              marginTop: "12px", padding: "16px", borderRadius: "14px",
                              background: "var(--bg-card)", border: "1px solid rgba(var(--ink),0.06)",
                              boxShadow: "0 6px 16px rgba(26,26,26,0.04)",
                              display: "flex", flexDirection: "column", gap: "14px"
                            }}>
                              
                              {/* Верхняя часть: Иконка + Текст */}
                              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                                <div style={{
                                  width: "32px", height: "32px", borderRadius: "10px", flexShrink: 0,
                                  background: "rgba(252,174,145,0.12)", color: "#FCAE91",
                                  display: "flex", alignItems: "center", justifyContent: "center"
                                }}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                  </svg>
                                </div>
                                <p style={{ margin: "2px 0 0", color: "var(--onyx)", fontSize: "12.5px", fontWeight: 700, lineHeight: 1.4, letterSpacing: "-0.2px" }}>
                                  {t("staff:editModal.role.catalogConfirm")}
                                </p>
                              </div>

                              {/* Нижняя часть: Кнопки */}
                              <div style={{ display: "flex", gap: "8px" }}>
                                <button 
                                  type="button" 
                                  onClick={() => setShowCatalogConfirm(false)} 
                                  style={{
                                    flex: 1, padding: "10px", 
                                    border: "1.5px solid rgba(var(--ink),0.08)", borderRadius: "10px", cursor: "pointer",
                                    background: "transparent", color: "var(--muted)", 
                                    fontSize: "12px", fontWeight: 700, fontFamily: "Manrope, sans-serif",
                                    transition: "all 0.2s ease"
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(var(--ink),0.03)"; e.currentTarget.style.borderColor = "rgba(var(--ink),0.15)"; }}
                                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(var(--ink),0.08)"; }}
                                >
                                  {t("common:buttons.cancel")}
                                </button>
                                <button 
                                  type="button" 
                                  onClick={() => { handleClose(); navigate("/dashboard/catalog?tab=services"); }} 
                                  style={{
                                    flex: 1, padding: "10px", border: "none", borderRadius: "10px", cursor: "pointer",
                                    background: "var(--onyx)", color: "var(--bg)", 
                                    fontSize: "12px", fontWeight: 700, fontFamily: "Manrope, sans-serif",
                                    boxShadow: "0 4px 12px rgba(26,26,26,0.15)", transition: "all 0.2s ease"
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(var(--ink),0.25)"; }}
                                  onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(26,26,26,0.15)"; }}
                                >
                                  {t("common:buttons.yes", { defaultValue: "Да, перейти" })}
                                </button>
                              </div>

                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── STEP 3 ── */}
              {step === 3 && (
                <div>
                  <h3 style={{ fontSize: "20px", fontWeight: 900, color: "var(--onyx)", letterSpacing: "-0.6px", margin: "0 0 4px" }}>{t("addModal.step3.heading")}</h3>
                  <p style={{ fontSize: "12px", color: "#AAA", margin: "0 0 20px" }}>{t("addModal.step3.sub")}</p>
                  
                  {/* Блок зарплаты (теперь тоже строго черно-белый) */}
                  <div style={{ marginBottom: "20px" }}>
                    <FieldLabel>{t("addModal.step3.salaryLabel")}</FieldLabel>
                    <div style={{ display: "flex", gap: "7px", marginBottom: "10px" }}>
                      {(["fixed", "percent", "hourly"] as const).map(type => {
                        const isOn = data.rate_type === type;
                        return (
                          <button key={type} type="button" onClick={() => set("rate_type", type)} style={{
                            flex: 1, padding: "10px 8px",
                            background: isOn ? "var(--onyx)" : "rgba(var(--ink),0.02)",
                            border: isOn ? "1.5px solid var(--onyx)" : "1.5px solid rgba(var(--ink),0.08)",
                            borderRadius: "10px", fontSize: "11.5px", fontWeight: isOn ? 700 : 600,
                            color: isOn ? "var(--bg)" : "var(--muted)", cursor: "pointer",
                            fontFamily: "Manrope, sans-serif", transition: "all 0.15s",
                            boxShadow: isOn ? "0 4px 12px rgba(26,26,26,0.15)" : "none"
                          }}>
                            {t(`common:salary.${type}`)}
                          </button>
                        );
                      })}
                    </div>
                    {data.rate_type && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", animation: "stepIn 0.2s ease" }}>
                        <input
                          type="text" inputMode="numeric" value={data.salary}
                          onChange={e => {
                            const v = e.target.value;
                            if (v === "" || /^\d+$/.test(v)) set("salary", v);
                          }}
                          placeholder={t("addModal.step3.salaryPlaceholder")}
                          style={{
                            flex: 1, padding: "11px 13px", background: "rgba(var(--ink),0.025)",
                            border: "1.5px solid rgba(var(--ink),0.09)", borderRadius: "12px",
                            fontSize: "14px", fontWeight: 600, color: "var(--onyx)", outline: "none",
                            fontFamily: "Manrope, sans-serif"
                          }}
                        />
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "#AAAAAA", padding: "0 6px" }}>
                          {data.rate_type === "percent" ? "%" : data.rate_type === "hourly" ? `${currencySymbol}/ч` : currencySymbol}
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <FieldLabel>{t("addModal.step3.scheduleLabel")}</FieldLabel>
                    <div style={{ border: "1.5px solid rgba(var(--ink),0.08)", borderRadius: "14px", overflow: "hidden" }}>
                      {DAYS_KEYS.map((key, idx) => {
                        const d = data.schedule[key];
                        const isLast = idx === DAYS_KEYS.length - 1;
                        return (
                          <div key={key} className="as-sched-row" style={{
                            display: "flex", alignItems: "center", gap: "10px",
                            padding: "9px 14px",
                            minHeight: "54px", boxSizing: "border-box", // 🔥 Фиксация высоты от прыжков
                            borderBottom: isLast ? "none" : "1px solid rgba(var(--ink),0.05)",
                            background: d.enabled ? "rgba(var(--ink),0.02)" : "transparent",
                          }}>
                            {/* Строгий черный свитчер */}
                            <div onClick={() => toggleDay(key)} style={{
                              width: "32px", height: "18px", borderRadius: "9px",
                              background: d.enabled ? "var(--onyx)" : "rgba(var(--ink),0.1)",
                              display: "flex", alignItems: "center", padding: "2px",
                              cursor: "pointer", flexShrink: 0, transition: "background 0.2s",
                            }}>
                              <div style={{
                                width: "14px", height: "14px", borderRadius: "50%",
                                background: "var(--bg-card)", boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                                transform: d.enabled ? "translateX(14px)" : "translateX(0)",
                                transition: "transform 0.2s cubic-bezier(0.34,1.2,0.64,1)",
                              }}/>
                            </div>
                            <span style={{ width: "90px", fontSize: "12px", fontWeight: d.enabled ? 600 : 400, color: d.enabled ? "var(--onyx)" : "#C0C0C0", flexShrink: 0, transition: "all 0.15s" }}>
                              {t(`common:days.${key}`)}
                            </span>

                            {/* Поля времени или бейдж DAY OFF */}
                            {d.enabled ? (
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1 }}>
                                <select className="as-time-select" value={d.from} onChange={e => updateDayTime(key, "from", e.target.value)} style={selectStyle}>
                                  {TIME_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                                <span style={{ fontSize: "12px", color: "#AAAAAA", fontWeight: 600 }}>—</span>
                                <select className="as-time-select" value={d.to} onChange={e => updateDayTime(key, "to", e.target.value)} style={selectStyle}>
                                  {TIME_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>

                                {/* Белая пилюля итоговых часов */}
                                <div style={{
                                  marginLeft: "auto",
                                  fontSize: "11px", fontWeight: 700, color: "var(--onyx)",
                                  background: "var(--bg-card)",
                                  border: "1px solid rgba(var(--ink),0.12)",
                                  boxShadow: "0 2px 8px rgba(26,26,26,0.04)",
                                  padding: "5px 12px",
                                  borderRadius: "20px",
                                  letterSpacing: "-0.2px"
                                }}>
                                  {(() => {
                                    const [fh, fm] = d.from.split(":").map(Number);
                                    const [th, tm] = d.to.split(":").map(Number);
                                    const h = Math.round((th * 60 + tm - fh * 60 - fm) / 60 * 10) / 10;
                                    return `${h}${t("staff:editModal.schedule.hoursSuffix", { defaultValue: "ч" })}`;
                                  })()}
                                </div>
                              </div>
                            ) : (
                              <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                                <span style={{
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  color: "var(--text3)",
                                  textTransform: "uppercase",
                                  letterSpacing: "0.8px",
                                  background: "rgba(var(--ink),0.02)",
                                  border: "1px dashed rgba(var(--ink),0.12)",
                                  padding: "4px 10px",
                                  borderRadius: "8px"
                                }}>
                                  {t("staff:schedule.dayOff")}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 4 ── */}
              {step === 4 && (
                <div>
                  <h3 style={{ fontSize: "20px", fontWeight: 900, color: "var(--onyx)", letterSpacing: "-0.6px", margin: "0 0 4px" }}>
                    {t("addModal.step4.exclaim")}{" "}<span style={{ color: "#FCAE91" }}>{data.name.split(" ")[0] || t("addModal.employeeFallback")}</span> {t("addModal.step4.added")}
                  </h3>
                  <p style={{ fontSize: "12px", color: "#AAA", margin: "0 0 20px", lineHeight: 1.6 }}>{t("addModal.step4.sub")}</p>

                  {/* Письмо уже ушло при создании — здесь подтверждение факта */}
                  <div style={{ display: "flex", alignItems: "center", gap: "11px", padding: "13px 16px", background: "rgba(163,201,168,0.1)", border: "1.5px solid rgba(163,201,168,0.28)", borderRadius: "14px", marginBottom: "14px" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "10px", flexShrink: 0, background: "#A3C9A8", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(163,201,168,0.35)" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 800, color: "var(--onyx)" }}>{t("addModal.step4.emailSentTitle")}</div>
                      <div style={{ fontSize: "11.5px", color: "#7d9a82", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{created?.email ?? data.email}</div>
                    </div>
                  </div>

                  {created?.inviteUrl && (
                    <div style={{ padding: "16px 18px", background: "rgba(var(--ink),0.025)", borderRadius: "14px", border: "1.5px solid rgba(var(--ink),0.08)", marginBottom: "14px" }}>
                      <p style={{ fontSize: "10px", fontWeight: 700, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 7px" }}>{t("addModal.step4.inviteLinkLabel")}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ flex: 1, minWidth: 0, padding: "9px 12px", background: "var(--bg-card)", border: "1px solid #F0EDE8", borderRadius: "10px", fontSize: "11px", fontWeight: 600, color: "var(--text3)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {created.inviteUrl}
                        </div>
                        <button type="button" onClick={handleCopy} style={{ padding: "9px 13px", background: copied ? "rgba(163,201,168,0.16)" : "rgba(252,174,145,0.12)", border: `1.5px solid ${copied ? "rgba(163,201,168,0.4)" : "rgba(252,174,145,0.3)"}`, borderRadius: "10px", fontSize: "12px", fontWeight: 700, color: copied ? "#7aab80" : "#F9A08B", cursor: "pointer", fontFamily: "Manrope, sans-serif", transition: "all 0.15s", whiteSpace: "nowrap" }}>
                          {copied ? t("addModal.step4.copied") : t("common:buttons.copy")}
                        </button>
                      </div>
                    </div>
                  )}

                  <p style={{ fontSize: "10px", fontWeight: 700, color: "#AAAAAA", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 9px" }}>{t("addModal.step4.sendInviteLabel")}</p>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={!created || resent === "sending"}
                      style={{ flex: 1, padding: "12px 14px", background: resent === "sent" ? "rgba(163,201,168,0.1)" : "rgba(252,174,145,0.08)", border: `1.5px solid ${resent === "sent" ? "rgba(163,201,168,0.3)" : "rgba(252,174,145,0.3)"}`, borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", cursor: created && resent !== "sending" ? "pointer" : "default", fontFamily: "Manrope, sans-serif", fontSize: "13px", fontWeight: 600, color: resent === "sent" ? "#7aab80" : "#F9A08B", opacity: created ? 1 : 0.5, transition: "all 0.15s" }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                      {resent === "sending" ? t("common:status.loading")
                        : resent === "sent" ? t("addModal.step4.resentOk")
                        : resent === "error" ? t("addModal.step4.resendError")
                        : t("addModal.step4.resend")}
                    </button>
                  </div>
                  <div style={{ padding: "13px 16px", background: "rgba(163,201,168,0.08)", borderRadius: "12px", border: "1px solid rgba(163,201,168,0.2)" }}>
                    <p style={{ fontSize: "11.5px", color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
                      {t("addModal.step4.inviteInfo")}
                    </p>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ── ACTION BUTTONS ── */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #F0EDE8", flexShrink: 0 }}>
            {step > 1 && step < 4 && (
              <button type="button" className="as-back-btn" onClick={goBack} style={{
                padding: "12px 16px", background: "transparent", border: "1.5px solid #EEEBE6",
                borderRadius: "12px", fontSize: "13px", fontWeight: 600, color: "var(--text3)",
                cursor: "pointer", display: "flex", alignItems: "center", gap: "5px",
                fontFamily: "Manrope, sans-serif", transition: "all 0.15s", flexShrink: 0,
              }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {t("common:buttons.back")}
              </button>
            )}
            {(() => {
              // Шаг 3 создаёт сотрудника (и отправляет письмо), шаг 4 только закрывает.
              const blocked = (step === 1 && !canStep1) || (step === 2 && !canStep2) || (step === 3 && (!canStep3 || saving));
              return (
                <button
                  type="button"
                  disabled={blocked}
                  onClick={step === 4 ? handleClose : step === 3 ? handleCreate : goNext}
                  style={{
                    flex: 1, padding: "13px 22px",
                    background: step === 4 ? "linear-gradient(135deg, #A3C9A8, #7aab80)" : "linear-gradient(135deg, #FCAE91, #F9A08B)",
                    border: "none", borderRadius: "12px", fontSize: "14px", fontWeight: 700, color: "white",
                    cursor: blocked ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                    letterSpacing: "-0.1px",
                    boxShadow: step === 4 ? "0 8px 24px rgba(163,201,168,0.35)" : "0 8px 24px rgba(252,174,145,0.32)",
                    transition: "all 0.2s ease", fontFamily: "Manrope, sans-serif",
                    opacity: blocked ? 0.4 : 1,
                  }}
                >
                  {step === 4 ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      {t("common:buttons.done")}
                    </>
                  ) : (
                    <>
                      {step === 3 ? (saving ? t("common:status.loading") : t("addModal.step3.createAndInvite")) : t("common:buttons.continue")}
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4L10 8L6 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </>
                  )}
                </button>
              );
            })()}
          </div>
          <p style={{ textAlign: "center", fontSize: "10px", color: "#CCCCCC", margin: "7px 0 0", fontWeight: 500 }}>
            {t("addModal.stepCounter", { current: step })}
          </p>
        </div>

      </div>
    </div>,
    document.body
  );
}
