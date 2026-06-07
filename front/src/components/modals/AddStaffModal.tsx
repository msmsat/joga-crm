import React, { useState, useCallback } from "react";
import "../../App.css";
import { Logo, InputField, PhoneField } from '../UI';

// ─── TYPES ────────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3 | 4;

interface ScheduleDay {
  enabled: boolean;
  from: string;
  to: string;
}

interface StaffData {
  name: string;
  phone: string;
  email: string;
  role: string;
  services: string[];
  salary: string;
  salaryType: "fixed" | "percent" | "hourly" | "";
  schedule: Record<string, ScheduleDay>;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
// ДОБАВЬ перед const PRESET_ROLES:
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

// ИЗМЕНИ PRESET_ROLES — убери emoji:
const PRESET_ROLES = [
  { id: "trainer",       label: "Тренер"          },
  { id: "barber",        label: "Барбер"           },
  { id: "stylist",       label: "Стилист"          },
  { id: "admin",         label: "Администратор"    },
  { id: "masseur",       label: "Массажист"        },
  { id: "cosmetologist", label: "Косметолог"       },
  { id: "yoga",          label: "Инструктор йоги"  },
  { id: "nail",          label: "Мастер маникюра"  },
];

const PRESET_SERVICES: Record<string, string[]> = {
  trainer: ["Персональная тренировка", "Групповое занятие", "Консультация", "Стретчинг"],
  barber: ["Мужская стрижка", "Борода", "Бритьё", "Укладка", "Комплекс"],
  stylist: ["Женская стрижка", "Окрашивание", "Укладка", "Кератин"],
  admin: ["Консультация", "Администрирование"],
  masseur: ["Классический массаж", "Антицеллюлитный", "Расслабляющий", "Спортивный"],
  cosmetologist: ["Чистка лица", "Пилинг", "Биоревитализация", "Ботокс"],
  yoga: ["Хатха йога", "Виньяса", "Кундалини", "Медитация"],
  nail: ["Маникюр", "Педикюр", "Гель-лак", "Наращивание"],
};

const DAYS = [
  { key: "mon", label: "Понедельник", short: "Пн" },
  { key: "tue", label: "Вторник", short: "Вт" },
  { key: "wed", label: "Среда", short: "Ср" },
  { key: "thu", label: "Четверг", short: "Чт" },
  { key: "fri", label: "Пятница", short: "Пт" },
  { key: "sat", label: "Суббота", short: "Сб" },
  { key: "sun", label: "Воскресенье", short: "Вс" },
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

// ─── ILLUSTRATIONS ─────────────────────────────────────────────────────────────
// Step 1: Premium floating profile card with avatar initials
function Illus1({ name }: { name: string }) {
  const initials = name.trim().length >= 2
    ? name.trim().split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";
  const hasName = name.trim().length >= 2;

  return (
    <svg viewBox="0 0 260 240" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 260 }}>
      <defs>
        <radialGradient id="i1bg" cx="50%" cy="50%" r="50%">
          <stop stopColor="rgba(252,174,145,0.12)" />
          <stop offset="1" stopColor="rgba(252,174,145,0)" />
        </radialGradient>
        <radialGradient id="i1avatar" cx="40%" cy="35%" r="60%">
          <stop stopColor="#FCAE91" />
          <stop offset="1" stopColor="#F07B60" />
        </radialGradient>
        <filter id="i1shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="rgba(26,26,26,0.10)" />
        </filter>
        <linearGradient id="i1card" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="rgba(255,255,255,1)" />
          <stop offset="1" stopColor="rgba(253,252,251,1)" />
        </linearGradient>
      </defs>

      {/* Ambient glow */}
      <ellipse cx="130" cy="120" rx="90" ry="80" fill="url(#i1bg)" />

      {/* Floating dots */}
      <circle cx="32" cy="56" r="5" fill="#FCAE91" opacity="0.3" />
      <circle cx="228" cy="68" r="3.5" fill="#A3C9A8" opacity="0.4" />
      <circle cx="220" cy="178" r="5" fill="#FCAE91" opacity="0.25" />
      <circle cx="44" cy="184" r="3" fill="#A3C9A8" opacity="0.35" />

      {/* Main card */}
      <rect x="36" y="50" width="188" height="142" rx="20" fill="url(#i1card)" filter="url(#i1shadow)" stroke="#F0EDE8" strokeWidth="1" />

      {/* Subtle gradient tint on card top */}
      <rect x="36" y="50" width="188" height="60" rx="20" fill="rgba(252,174,145,0.04)" />
      <rect x="36" y="90" width="188" height="20" fill="rgba(252,174,145,0.04)" />

      {/* Avatar circle */}
      <circle cx="130" cy="102" r="28" fill={hasName ? "url(#i1avatar)" : "rgba(26,26,26,0.06)"} />
      {hasName ? (
        <text x="130" y="109" textAnchor="middle" fontSize="14" fontWeight="800" fill="white" fontFamily="Manrope, sans-serif">{initials}</text>
      ) : (
        <>
          <circle cx="130" cy="97" r="8" fill="rgba(26,26,26,0.15)" />
          <path d="M114 116 Q130 109 146 116" stroke="rgba(26,26,26,0.15)" strokeWidth="3" strokeLinecap="round" fill="none" />
        </>
      )}

      {/* "Online" badge */}
      <circle cx="152" cy="82" r="7" fill="white" />
      <circle cx="152" cy="82" r="4.5" fill="#A3C9A8" />

      {/* Name line */}
      {hasName ? (
        <text x="130" y="148" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1A1A1A" fontFamily="Manrope, sans-serif">{name.split(" ")[0]}</text>
      ) : (
        <rect x="88" y="141" width="84" height="8" rx="4" fill="rgba(26,26,26,0.08)" />
      )}

      {/* Sub-line */}
      <rect x="100" y="155" width="60" height="5" rx="2.5" fill="rgba(26,26,26,0.05)" />

      {/* Two chip pills at bottom */}
      <rect x="52" y="172" width="72" height="12" rx="6" fill="rgba(252,174,145,0.15)" stroke="rgba(252,174,145,0.3)" strokeWidth="1" />
      <text x="88" y="181.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#D07A5A" fontFamily="Manrope, sans-serif">📱 Контакты</text>

      <rect x="132" y="172" width="72" height="12" rx="6" fill="rgba(163,201,168,0.15)" stroke="rgba(163,201,168,0.3)" strokeWidth="1" />
      <text x="168" y="181.5" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#5A8A60" fontFamily="Manrope, sans-serif">✓ Профиль</text>

      {/* Edit badge top-right of card */}
      <circle cx="208" cy="62" r="13" fill="white" stroke="#F0EDE8" strokeWidth="1" filter="url(#i1shadow)" />
      <path d="M203 65 L207 61 L211 65 L207 69 Z" fill="rgba(249,160,139,0.8)" />
    </svg>
  );
}

// Step 2: Role selection visualization — animated role cards floating
function Illus2({ role }: { role: string }) {
  const found = PRESET_ROLES.find(r => r.id === role);
  const label = found?.label || "Роль";

  return (
    <svg viewBox="0 0 260 240" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 260 }}>
      <defs>
        <radialGradient id="i2bg" cx="50%" cy="50%" r="50%">
          <stop stopColor="rgba(163,201,168,0.1)" />
          <stop offset="1" stopColor="rgba(163,201,168,0)" />
        </radialGradient>
        <filter id="i2shadow">
          <feDropShadow dx="0" dy="6" stdDeviation="12" floodColor="rgba(26,26,26,0.08)" />
        </filter>
        <linearGradient id="i2accent" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FCAE91" />
          <stop offset="1" stopColor="#F9A08B" />
        </linearGradient>
      </defs>

      <ellipse cx="130" cy="120" rx="85" ry="75" fill="url(#i2bg)" />

      {/* Floating background role chips */}
      {[
        { x: 28, y: 52, label: "Тренер", emoji: "🏋️", opacity: 0.4 },
        { x: 168, y: 44, label: "Барбер", emoji: "✂️", opacity: 0.4 },
        { x: 20, y: 168, label: "Стилист", emoji: "💇", opacity: 0.35 },
        { x: 172, y: 172, label: "Косметолог", emoji: "✨", opacity: 0.35 },
      ].map((chip, i) => (
        <g key={i} opacity={chip.opacity}>
          <rect x={chip.x} y={chip.y} width="64" height="26" rx="13" fill="rgba(26,26,26,0.04)" stroke="#EEEBE6" strokeWidth="1" />
          <text x={chip.x + 14} y={chip.y + 17} fontSize="10" fontFamily="Manrope, sans-serif">{chip.emoji}</text>
          <text x={chip.x + 28} y={chip.y + 17} fontSize="8" fontWeight="600" fill="#999" fontFamily="Manrope, sans-serif">{chip.label}</text>
        </g>
      ))}

      {/* Central selected role card */}
      <rect x="62" y="80" width="136" height="82" rx="18" fill="white" filter="url(#i2shadow)" stroke="#F0EDE8" strokeWidth="1" />
      <rect x="62" y="80" width="136" height="82" rx="18" fill="rgba(252,174,145,0.03)" />

      {/* Role icon circle */}
      <circle cx="130" cy="108" r="22" fill="url(#i2accent)" opacity={role ? 1 : 0.3} />
      <g transform="translate(121, 99)" style={{ color: "white" }}>
        {ROLE_ICONS[role] || (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="5" />
          </svg>
        )}
      </g>

      {/* Role name */}
      {role ? (
        <text x="130" y="148" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1A1A1A" fontFamily="Manrope, sans-serif">{label}</text>
      ) : (
        <rect x="96" y="141" width="68" height="8" rx="4" fill="rgba(26,26,26,0.07)" />
      )}

      {/* Selected checkmark */}
      {role && (
        <g>
          <circle cx="162" cy="84" r="10" fill="url(#i2accent)" />
          <path d="M157 84 L161 88 L167 80" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}

      {/* Service tags floating below */}
      <rect x="72" y="174" width="48" height="12" rx="6" fill="rgba(163,201,168,0.18)" />
      <rect x="126" y="174" width="64" height="12" rx="6" fill="rgba(163,201,168,0.18)" />
      <text x="96" y="183.5" textAnchor="middle" fontSize="7" fontWeight="700" fill="#6A9E72" fontFamily="Manrope, sans-serif">Услуги</text>
      <text x="158" y="183.5" textAnchor="middle" fontSize="7" fontWeight="700" fill="#6A9E72" fontFamily="Manrope, sans-serif">Специализация</text>

      {/* Dots */}
      <circle cx="46" cy="112" r="4" fill="#FCAE91" opacity="0.3" />
      <circle cx="214" cy="108" r="3" fill="#A3C9A8" opacity="0.4" />
    </svg>
  );
}

// Step 3: Calendar grid schedule visualization
function Illus3({ schedule }: { schedule: Record<string, ScheduleDay> }) {
  const days = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
  const keys = ["mon","tue","wed","thu","fri","sat","sun"];

  return (
    <svg viewBox="0 0 260 240" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 260 }}>
      <defs>
        <filter id="i3shadow">
          <feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="rgba(26,26,26,0.09)" />
        </filter>
        <linearGradient id="i3grad" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FCAE91" />
          <stop offset="1" stopColor="#A3C9A8" />
        </linearGradient>
        <radialGradient id="i3bg" cx="50%" cy="50%" r="50%">
          <stop stopColor="rgba(163,201,168,0.09)" />
          <stop offset="1" stopColor="rgba(163,201,168,0)" />
        </radialGradient>
      </defs>

      <ellipse cx="130" cy="120" rx="88" ry="78" fill="url(#i3bg)" />

      {/* Main calendar card */}
      <rect x="32" y="42" width="196" height="148" rx="20" fill="white" filter="url(#i3shadow)" stroke="#F0EDE8" strokeWidth="1" />

      {/* Header strip */}
      <rect x="32" y="42" width="196" height="32" rx="20" fill="rgba(252,174,145,0.1)" />
      <rect x="32" y="60" width="196" height="14" fill="rgba(252,174,145,0.1)" />
      <text x="130" y="62" textAnchor="middle" fontSize="9" fontWeight="800" fill="#C07060" fontFamily="Manrope, sans-serif" letterSpacing="1">РАБОЧИЙ ГРАФИК</text>

      {/* Day header row */}
      {days.map((d, i) => (
        <text key={d} x={52 + i * 26} y={92} textAnchor="middle" fontSize="8" fontWeight="700" fill="#BBBBBB" fontFamily="Manrope, sans-serif">{d}</text>
      ))}

      {/* Day cells */}
      {keys.map((key, i) => {
        const enabled = schedule[key]?.enabled ?? false;
        const cx = 52 + i * 26;
        return (
          <g key={key}>
            <rect
              x={cx - 10} y={100}
              width={20} height={20}
              rx={6}
              fill={enabled ? "rgba(252,174,145,0.5)" : "rgba(26,26,26,0.04)"}
              stroke={enabled ? "rgba(252,174,145,0.8)" : "transparent"}
              strokeWidth="1.2"
            />
            {enabled && (
              <path
                d={`M${cx - 4} 110 L${cx} 114 L${cx + 5} 106`}
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </g>
        );
      })}

      {/* Time range row */}
      {keys.map((key, i) => {
        const d = schedule[key];
        if (!d?.enabled) return null;
        const cx = 52 + i * 26;
        return (
          <rect key={key} x={cx - 9} y={128} width={18} height={4} rx={2} fill="rgba(252,174,145,0.3)" />
        );
      })}

      {/* Active days count */}
      <rect x="50" y="146" width="160" height="28" rx="10" fill="url(#i3grad)" opacity="0.85" />
      <text x="130" y="163" textAnchor="middle" fontSize="9" fontWeight="800" fill="white" fontFamily="Manrope, sans-serif" letterSpacing="0.5">
        {Object.values(schedule).filter(d => d.enabled).length} рабочих дней в неделю
      </text>

      {/* Corner dots */}
      <circle cx="40" cy="50" r="4" fill="#FCAE91" opacity="0.45" />
      <circle cx="220" cy="50" r="4" fill="#FCAE91" opacity="0.45" />
      <circle cx="42" cy="188" r="3" fill="#A3C9A8" opacity="0.4" />
      <circle cx="218" cy="188" r="3" fill="#A3C9A8" opacity="0.4" />
    </svg>
  );
}

// Step 4: Success state — checkmark and invite message
function Illus4({ name }: { name: string }) {
  const first = name.split(" ")[0] || "Сотрудник";
  return (
    <svg viewBox="0 0 260 240" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", maxWidth: 260 }}>
      <defs>
        <radialGradient id="i4glow" cx="50%" cy="45%" r="50%">
          <stop stopColor="rgba(163,201,168,0.2)" />
          <stop offset="1" stopColor="rgba(163,201,168,0)" />
        </radialGradient>
        <linearGradient id="i4green" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#A3C9A8" />
          <stop offset="1" stopColor="#7aab80" />
        </linearGradient>
        <linearGradient id="i4peach" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#FCAE91" />
          <stop offset="1" stopColor="#F9A08B" />
        </linearGradient>
        <filter id="i4shadow">
          <feDropShadow dx="0" dy="8" stdDeviation="16" floodColor="rgba(26,26,26,0.1)" />
        </filter>
      </defs>

      <ellipse cx="130" cy="100" rx="80" ry="72" fill="url(#i4glow)" />

      {/* Confetti dots */}
      {[
        { x: 64, y: 58, r: 5, fill: "#FCAE91", op: 0.5 },
        { x: 196, y: 50, r: 4, fill: "#A3C9A8", op: 0.5 },
        { x: 210, y: 84, r: 3, fill: "#FCAE91", op: 0.4 },
        { x: 48, y: 90, r: 3, fill: "#A3C9A8", op: 0.4 },
        { x: 74, y: 182, r: 4, fill: "#A3C9A8", op: 0.35 },
        { x: 186, y: 176, r: 4.5, fill: "#FCAE91", op: 0.35 },
        { x: 224, y: 148, r: 3, fill: "#A3C9A8", op: 0.3 },
        { x: 36, y: 154, r: 3.5, fill: "#FCAE91", op: 0.3 },
      ].map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.fill} opacity={d.op} />
      ))}

      {/* Big success circle */}
      <circle cx="130" cy="94" r="38" fill="rgba(163,201,168,0.12)" />
      <circle cx="130" cy="94" r="28" fill="white" filter="url(#i4shadow)" stroke="#F0EDE8" strokeWidth="1" />
      <circle cx="130" cy="94" r="28" fill="rgba(163,201,168,0.06)" />
      <path d="M117 94 L126 103 L143 82" stroke="url(#i4green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

      {/* WhatsApp invite bubble */}
      <rect x="44" y="144" width="172" height="52" rx="16" fill="white" filter="url(#i4shadow)" stroke="#F0EDE8" strokeWidth="1" />

      {/* WA icon */}
      <circle cx="66" cy="170" r="12" fill="rgba(37,211,102,0.12)" />
      <path d="M62 170 L66 174 L71 165" stroke="#25d366" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

      {/* Text lines in bubble */}
      <text x="84" y="164" fontSize="9" fontWeight="700" fill="#1A1A1A" fontFamily="Manrope, sans-serif">Приглашение отправлено</text>
      <text x="84" y="178" fontSize="8" fontWeight="500" fill="#AAAAAA" fontFamily="Manrope, sans-serif">{first} получит ссылку для входа</text>

      {/* Arrow right */}
      <path d="M200 170 L205 170 M202 167 L205 170 L202 173" stroke="#CCCCCC" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────
function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i + 1 === current ? "22px" : "6px",
          height: "6px",
          borderRadius: "3px",
          background: i + 1 <= current ? "#FCAE91" : "rgba(26,26,26,0.1)",
          transition: "all 0.3s cubic-bezier(0.34,1.1,0.64,1)",
        }} />
      ))}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: "block",
      fontSize: "11px",
      fontWeight: 700,
      color: "#999",
      letterSpacing: "0.6px",
      textTransform: "uppercase" as const,
      marginBottom: "7px",
    }}>
      {children}
    </label>
  );
}

function FocusInput({ value, onChange, placeholder, type = "text", onKeyDown }: {
  value: string; onChange: (v: string) => void; placeholder: string; type?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: "100%",
        padding: "12px 15px",
        background: focused ? "#fff" : "rgba(26,26,26,0.025)",
        border: focused ? "1.5px solid #FCAE91" : "1.5px solid rgba(26,26,26,0.09)",
        borderRadius: "12px",
        fontSize: "14px",
        fontWeight: 500,
        color: "#1A1A1A",
        outline: "none",
        fontFamily: "Manrope, sans-serif",
        boxShadow: focused ? "0 0 0 3px rgba(252,174,145,0.14)" : "none",
        transition: "all 0.18s ease",
        boxSizing: "border-box" as const,
      }}
    />
  );
}

// ─── MAIN MODAL ───────────────────────────────────────────────────────────────
interface AddStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (data: StaffData) => void;
}

export default function AddStaffModal({ isOpen, onClose, onSuccess }: AddStaffModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [animating, setAnimating] = useState(false);
  const [dir, setDir] = useState<1 | -1>(1);
  const [customServiceInput, setCustomServiceInput] = useState("");
  const [inviteLink] = useState(`https://velora.studio/join/k9x2a-${Math.random().toString(36).slice(2, 8)}`);

  const [data, setData] = useState<StaffData>({
    name: "", phone: "", email: "",
    role: "", services: [],
    salary: "", salaryType: "",
    schedule: { ...defaultSchedule },
  });

  const set = useCallback(<K extends keyof StaffData>(k: K, v: StaffData[K]) => {
    setData(d => ({ ...d, [k]: v }));
  }, []);

  function goNext() {
    if (animating) return;
    setDir(1);
    setAnimating(true);
    setTimeout(() => {
      setStep(s => Math.min(s + 1, 4) as Step);
      setAnimating(false);
    }, 200);
  }

  function goBack() {
    if (animating || step === 1) return;
    setDir(-1);
    setAnimating(true);
    setTimeout(() => {
      setStep(s => Math.max(s - 1, 1) as Step);
      setAnimating(false);
    }, 200);
  }

  function handleClose() {
    setStep(1);
    setData({ name: "", phone: "", email: "", role: "", services: [], salary: "", salaryType: "", schedule: { ...defaultSchedule } });
    onClose();
  }

  function handleFinish() {
    onSuccess?.(data);
    handleClose();
  }

  // Services: toggle from preset or add custom via Enter
  function toggleService(svc: string) {
    set("services", data.services.includes(svc)
      ? data.services.filter(s => s !== svc)
      : [...data.services, svc]
    );
  }

  function handleServiceKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && customServiceInput.trim()) {
      const trimmed = customServiceInput.trim();
      if (!data.services.includes(trimmed)) {
        set("services", [...data.services, trimmed]);
      }
      setCustomServiceInput("");
    }
  }

  function toggleDay(key: string) {
    set("schedule", { ...data.schedule, [key]: { ...data.schedule[key], enabled: !data.schedule[key].enabled } });
  }

  function updateDayTime(key: string, field: "from" | "to", val: string) {
    set("schedule", { ...data.schedule, [key]: { ...data.schedule[key], [field]: val } });
  }

  const effectiveRole = PRESET_ROLES.find(r => r.id === data.role)?.label || data.role;
  const canStep1 = data.name.trim().length >= 2 && (data.phone.trim().length >= 6 || data.email.trim().includes("@"));
  const canStep2 = data.role.trim().length >= 2;
  const canStep3 = Object.values(data.schedule).some(d => d.enabled);

  const presetServices = data.role ? (PRESET_SERVICES[data.role] || []) : [];
  const enabledDays = Object.values(data.schedule).filter(d => d.enabled).length;

  const selectStyle: React.CSSProperties = {
    padding: "7px 6px",
    background: "rgba(26,26,26,0.03)",
    border: "1.5px solid rgba(26,26,26,0.09)",
    borderRadius: "8px",
    fontSize: "12px",
    fontWeight: 600,
    color: "#1A1A1A",
    outline: "none",
    fontFamily: "Manrope, sans-serif",
    cursor: "pointer",
    width: "76px",
    appearance: "none" as const,
  };

  if (!isOpen) return null;

  const stepMeta = [
    { title: "О сотруднике",        sub: "Как зовут нового члена команды?",            trustLabel: "Данные сотрудника защищены" },
    { title: "Роль и услуги",       sub: "Должность и список услуг",                    trustLabel: "Роль можно изменить в любой момент" },
    { title: "График и зарплата",   sub: "Когда работает и сколько зарабатывает?",      trustLabel: "График синхронизируется с журналом" },
    { title: "Готово!",             sub: `Осталось только пригласить ${data.name.split(" ")[0] || "его"}`, trustLabel: "" },
  ];

  const current = stepMeta[step - 1];

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(26,26,26,0.40)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000,
        padding: "16px",
        animation: "overlayIn 0.22s ease",
      }}
      onClick={handleClose}
    >
      <style>{`
        @keyframes overlayIn { from { opacity:0 } to { opacity:1 } }
        @keyframes modalIn { from { opacity:0; transform: scale(0.93) translateY(20px) } to { opacity:1; transform: scale(1) translateY(0) } }
        @keyframes stepIn { from { opacity:0; transform: translateX(${dir === 1 ? 24 : -24}px) } to { opacity:1; transform: translateX(0) } }
        @keyframes pulse2 { 0%,100% { opacity:1; transform:scale(1) } 50% { opacity:0.5; transform:scale(1.5) } }
        @keyframes checkpop { from { transform: scale(0.6); opacity:0 } to { transform: scale(1); opacity:1 } }

        .as-role-card { transition: all 0.18s cubic-bezier(0.34,1.1,0.64,1); }
        .as-role-card:hover { border-color: #FCAE91 !important; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(252,174,145,0.15) !important; }
        .as-svc-pill { transition: all 0.15s ease; cursor: pointer; }
        .as-svc-pill:hover { border-color: rgba(252,174,145,0.6) !important; background: rgba(252,174,145,0.08) !important; }
        .as-sched-row { transition: background 0.15s; }
        .as-sched-row:hover { background: rgba(252,174,145,0.03) !important; }
        .as-close-btn:hover { background: rgba(26,26,26,0.1) !important; }
        .as-back-btn:hover { background: rgba(26,26,26,0.04) !important; border-color: #DDD !important; }
        .as-scroll::-webkit-scrollbar { width: 3px; }
        .as-scroll::-webkit-scrollbar-thumb { background: rgba(249,160,139,0.25); border-radius: 3px; }
      `}</style>

      {/* ── MODAL ── */}
      <div
        style={{
          width: "100%",
          maxWidth: "860px",
          height: "596px",
          background: "#FDFCFB",
          borderRadius: "24px",
          boxShadow: "0 40px 100px rgba(26,26,26,0.18), 0 8px 32px rgba(26,26,26,0.07)",
          display: "grid",
          gridTemplateColumns: "280px 1fr",
          overflow: "hidden",
          animation: "modalIn 0.42s cubic-bezier(0.34,1.1,0.64,1)",
        }}
        onClick={e => e.stopPropagation()}
      >

        {/* ──────────── LEFT PANEL ──────────── */}
        <div style={{
          background: "white",
          padding: "36px 30px 28px",
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid #F0EDE8",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Mesh background */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: `
              radial-gradient(circle at 15% 15%, rgba(252,174,145,0.07) 0%, transparent 55%),
              radial-gradient(circle at 85% 85%, rgba(163,201,168,0.07) 0%, transparent 55%)
            `,
          }} />

          {/* TOP: Logo + step info */}
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ marginBottom: "28px" }}>
              <Logo />
            </div>

            <p style={{ fontSize: "10px", fontWeight: 700, color: "#FCAE91", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 6px" }}>
              Шаг {step} из 4
            </p>
            <h2 style={{ fontSize: "19px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.6px", lineHeight: 1.25, margin: "0 0 6px" }}>
              {current.title}
            </h2>
            <p style={{ fontSize: "12px", color: "#999", lineHeight: 1.55, margin: "0 0 16px" }}>
              {current.sub}
            </p>
            <StepDots current={step} total={4} />
          </div>

          {/* MIDDLE: Illustration — flex 1, centered */}
          <div style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "12px 0",
            position: "relative", zIndex: 1,
          }}>
            {step === 1 && <Illus1 name={data.name} />}
            {step === 2 && <Illus2 role={data.role} />}
            {step === 3 && <Illus3 schedule={data.schedule} />}
            {step === 4 && <Illus4 name={data.name} />}
          </div>

          {/* BOTTOM: Trust signal / summary */}
          <div style={{
            padding: "11px 13px",
            background: step === 4 ? "rgba(163,201,168,0.1)" : "rgba(163,201,168,0.08)",
            borderRadius: "10px",
            position: "relative", zIndex: 1,
          }}>
            {step < 4 ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{
                  width: "7px", height: "7px", borderRadius: "50%",
                  background: "#A3C9A8", flexShrink: 0,
                  animation: "pulse2 2.2s infinite",
                }} />
                <span style={{ fontSize: "11px", color: "#666", fontWeight: 500 }}>
                  {current.trustLabel}
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {[
                  { l: "Сотрудник", v: data.name },
                  { l: "Роль", v: effectiveRole },
                  { l: "Рабочих дней", v: `${enabledDays} из 7` },
                ].map(row => (
                  <div key={row.l} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "11px", color: "#AAAAAA" }}>{row.l}</span>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#1A1A1A" }}>{row.v || "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ──────────── RIGHT PANEL ──────────── */}
        <div style={{
          padding: "16px 30px 24px",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Close */}
          <button
            className="as-close-btn"
            onClick={handleClose}
            style={{
              position: "absolute", top: "14px", right: "14px",
              width: "28px", height: "28px",
              background: "rgba(26,26,26,0.05)", border: "none",
              borderRadius: "8px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#AAA", transition: "background 0.15s", flexShrink: 0,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* Scrollable form */}
          <div
            className="as-scroll"
            style={{ flex: 1, overflowY: "auto", paddingRight: "4px", marginTop: "28px" }}
          >
            <div key={step} style={{ animation: "stepIn 0.25s cubic-bezier(0.34,1.1,0.64,1)" }}>

              {/* ══════════ STEP 1 ══════════ */}
              {step === 1 && (
                <div>
                  <h3 style={{ fontSize: "20px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.6px", margin: "0 0 4px" }}>
                    Личные данные
                  </h3>
                  <p style={{ fontSize: "12px", color: "#AAA", margin: "0 0 24px" }}>
                    Начнём с имени и способа связи
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div>
                      <FieldLabel>Полное имя *</FieldLabel>
                      <InputField
                        value={data.name}
                        onChange={(v: string) => set("name", v)}
                        placeholder="Например: Анна Новикова"
                      />
                    </div>
                    <div>
                      <FieldLabel>Номер телефона</FieldLabel>
                      <PhoneField
                        value={data.phone}
                        onChange={(v: string | undefined) => set("phone", v || "")}
                      />
                    </div>
                    <div>
                      <FieldLabel>Электронная почта</FieldLabel>
                      <InputField
                        type="email"
                        value={data.email}
                        onChange={(v: string) => set("email", v)}
                        placeholder="anna@velora.studio"
                      />
                    </div>

                    {/* Preview card — appears when name is typed */}
                    {data.name.trim().length >= 2 && (
                      <div style={{
                        padding: "13px 15px",
                        background: "linear-gradient(135deg, rgba(252,174,145,0.07), rgba(163,201,168,0.05))",
                        borderRadius: "14px",
                        border: "1.5px solid rgba(252,174,145,0.2)",
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
                          <div style={{ fontSize: "13px", fontWeight: 700, color: "#1A1A1A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {data.name}
                          </div>
                          <div style={{ fontSize: "11px", color: "#AAA", marginTop: "2px" }}>
                            {data.phone || data.email || "Контакты не указаны"}
                          </div>
                        </div>
                        <div style={{
                          padding: "3px 8px", borderRadius: "6px",
                          background: "rgba(163,201,168,0.18)",
                          fontSize: "9px", fontWeight: 700, color: "#5A8A60", letterSpacing: "0.5px",
                        }}>
                          НОВЫЙ
                        </div>
                      </div>
                    )}

                    <div style={{
                      padding: "11px 14px",
                      background: "rgba(252,174,145,0.06)",
                      borderRadius: "12px",
                      border: "1px solid rgba(252,174,145,0.18)",
                      display: "flex", gap: "9px", alignItems: "flex-start",
                    }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FCAE91"
                        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                        style={{ flexShrink: 0, marginTop: "1px" }}>
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <p style={{ fontSize: "11.5px", color: "#888", margin: 0, lineHeight: 1.55 }}>
                        Укажите телефон или email — на него придёт приглашение для входа в систему.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ══════════ STEP 2 ══════════ */}
              {step === 2 && (
                <div>
                  <h3 style={{ fontSize: "20px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.6px", margin: "0 0 4px" }}>
                    Роль и услуги
                  </h3>
                  <p style={{ fontSize: "12px", color: "#AAA", margin: "0 0 20px" }}>
                    Выберите должность — услуги подберутся автоматически
                  </p>

                  {/* Role cards grid */}
                  <div style={{ marginBottom: "18px" }}>
                    <FieldLabel>Должность *</FieldLabel>
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, 1fr)",
                      gap: "7px",
                      marginBottom: "10px",
                    }}>
                      {PRESET_ROLES.map(r => {
                        const isSelected = data.role === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            className="as-role-card"
                            onClick={() => {
                              const newRole = data.role === r.id ? "" : r.id;
                              set("role", newRole);
                              // Auto-apply preset services on role select
                              if (newRole && PRESET_SERVICES[newRole]) {
                                set("services", [...PRESET_SERVICES[newRole]]);
                              }
                            }}
                            style={{
                              padding: "11px 6px",
                              background: isSelected ? "rgba(252,174,145,0.1)" : "rgba(26,26,26,0.02)",
                              border: isSelected ? "1.5px solid #FCAE91" : "1.5px solid rgba(26,26,26,0.08)",
                              borderRadius: "12px",
                              cursor: "pointer",
                              display: "flex", flexDirection: "column", alignItems: "center", gap: "5px",
                              boxShadow: isSelected ? "0 4px 16px rgba(252,174,145,0.15)" : "none",
                              fontFamily: "Manrope, sans-serif",
                              position: "relative",
                            }}
                          >
                            {isSelected && (
                              <div style={{
                                position: "absolute", top: "4px", right: "5px",
                                width: "12px", height: "12px",
                                background: "#FCAE91", borderRadius: "50%",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                animation: "checkpop 0.25s cubic-bezier(0.34,1.1,0.64,1)",
                              }}>
                                <svg width="6" height="6" viewBox="0 0 8 8" fill="none">
                                  <path d="M1.5 4 L3 5.5 L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </div>
                            )}
                            <span style={{
                              display: "flex", alignItems: "center", justifyContent: "center",
                              color: isSelected ? "#FCAE91" : "#CCCCCC",
                              transition: "color 0.18s",
                            }}>
                              {ROLE_ICONS[r.id]}
                            </span>
                            <span style={{
                              fontSize: "9.5px",
                              fontWeight: isSelected ? 700 : 500,
                              color: isSelected ? "#1A1A1A" : "#888",
                              textAlign: "center", lineHeight: 1.2,
                            }}>
                              {r.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom role input */}
                    <FocusInput
                      value={PRESET_ROLES.find(r => r.id === data.role) ? "" : data.role}
                      onChange={(val: string) => set("role", val)}
                      placeholder="Или введите свою должность..."
                    />
                  </div>

                  {/* Services — click to toggle, no Add button */}
                  <div>
                    <FieldLabel>Услуги</FieldLabel>

                    {/* Preset service pills from role */}
                    {presetServices.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
                        {presetServices.map(svc => {
                          const isOn = data.services.includes(svc);
                          return (
                            <button
                              key={svc}
                              type="button"
                              className="as-svc-pill"
                              onClick={() => toggleService(svc)}
                              style={{
                                padding: "6px 12px",
                                background: isOn ? "rgba(252,174,145,0.14)" : "rgba(26,26,26,0.04)",
                                border: isOn ? "1.5px solid rgba(252,174,145,0.5)" : "1.5px solid transparent",
                                borderRadius: "20px",
                                fontSize: "12px",
                                fontWeight: isOn ? 700 : 500,
                                color: isOn ? "#C07060" : "#666",
                                fontFamily: "Manrope, sans-serif",
                              }}
                            >
                              {isOn ? "✓ " : ""}{svc}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Custom service — Enter to add, no button */}
                    <div style={{ position: "relative" }}>
                      <FocusInput
                        value={customServiceInput}
                        onChange={setCustomServiceInput}
                        onKeyDown={handleServiceKeyDown}
                        placeholder="Добавить услугу — нажмите Enter"
                      />
                      {customServiceInput && (
                        <div style={{
                          position: "absolute", right: "12px", top: "50%",
                          transform: "translateY(-50%)",
                          fontSize: "10px", fontWeight: 700, color: "#FCAE91",
                          background: "rgba(252,174,145,0.12)",
                          padding: "3px 7px", borderRadius: "6px",
                          pointerEvents: "none",
                        }}>
                          Enter ↵
                        </div>
                      )}
                    </div>

                    {/* Added services tags */}
                    {data.services.filter(s => !presetServices.includes(s)).length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                        {data.services.filter(s => !presetServices.includes(s)).map(svc => (
                          <div key={svc} style={{
                            display: "flex", alignItems: "center", gap: "5px",
                            padding: "5px 10px 5px 12px",
                            background: "rgba(163,201,168,0.12)",
                            border: "1.5px solid rgba(163,201,168,0.35)",
                            borderRadius: "20px",
                            fontSize: "12px", fontWeight: 600, color: "#5A8A60",
                          }}>
                            {svc}
                            <span
                              onClick={() => toggleService(svc)}
                              style={{ cursor: "pointer", opacity: 0.6, fontSize: "11px", lineHeight: 1 }}
                            >✕</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ══════════ STEP 3 ══════════ */}
              {step === 3 && (
                <div>
                  <h3 style={{ fontSize: "20px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.6px", margin: "0 0 4px" }}>
                    График и зарплата
                  </h3>
                  <p style={{ fontSize: "12px", color: "#AAA", margin: "0 0 20px" }}>
                    Настройте рабочие дни и вознаграждение
                  </p>

                  {/* Schedule */}
                  <div style={{ marginBottom: "20px" }}>
                    <FieldLabel>Рабочий график</FieldLabel>
                    <div style={{ border: "1.5px solid rgba(26,26,26,0.08)", borderRadius: "14px", overflow: "hidden" }}>
                      {DAYS.map((day, idx) => {
                        const d = data.schedule[day.key];
                        const isLast = idx === DAYS.length - 1;
                        return (
                          <div
                            key={day.key}
                            className="as-sched-row"
                            style={{
                              display: "flex", alignItems: "center", gap: "10px",
                              padding: "9px 14px",
                              borderBottom: isLast ? "none" : "1px solid rgba(26,26,26,0.05)",
                              background: d.enabled ? "rgba(252,174,145,0.02)" : "transparent",
                            }}
                          >
                            {/* Toggle */}
                            <div onClick={() => toggleDay(day.key)} style={{
                              width: "32px", height: "18px", borderRadius: "9px", // 🔥 Четные размеры для 100% пиксельной точности
                              background: d.enabled ? "#FCAE91" : "rgba(26,26,26,0.1)",
                              display: "flex", alignItems: "center", padding: "2px", // 🔥 Идеальное выравнивание внутри через Flexbox
                              cursor: "pointer", flexShrink: 0, transition: "background 0.2s",
                            }}>
                              <div style={{
                                width: "14px", height: "14px", borderRadius: "50%",
                                background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                                transform: d.enabled ? "translateX(14px)" : "translateX(0)", // 🔥 Двигаем кружок через transform (без position: absolute)
                                transition: "transform 0.2s cubic-bezier(0.34,1.2,0.64,1)",
                              }} />
                            </div>

                            {/* Day name */}
                            <span style={{
                              width: "90px", fontSize: "12px",
                              fontWeight: d.enabled ? 600 : 400,
                              color: d.enabled ? "#1A1A1A" : "#C0C0C0",
                              flexShrink: 0, transition: "all 0.15s",
                            }}>
                              {day.label}
                            </span>

                            {/* Time selectors */}
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
                              <span style={{ fontSize: "11px", color: "#CCC", fontStyle: "italic", flex: 1 }}>Выходной</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Salary */}
                  <div>
                    <FieldLabel>Зарплата (опционально)</FieldLabel>
                    <div style={{ display: "flex", gap: "7px", marginBottom: "10px" }}>
                      {(["fixed", "percent", "hourly"] as const).map(type => {
                        const labels: Record<string, string> = { fixed: "Оклад", percent: "% от выручки", hourly: "Почасовая" };
                        const isOn = data.salaryType === type;
                        return (
                          <button key={type} type="button"
                            onClick={() => set("salaryType", type)}
                            style={{
                              flex: 1, padding: "9px 8px",
                              background: isOn ? "rgba(252,174,145,0.1)" : "rgba(26,26,26,0.03)",
                              border: isOn ? "1.5px solid #FCAE91" : "1.5px solid rgba(26,26,26,0.08)",
                              borderRadius: "10px",
                              fontSize: "11px", fontWeight: isOn ? 700 : 500,
                              color: isOn ? "#1A1A1A" : "#888",
                              cursor: "pointer", fontFamily: "Manrope, sans-serif",
                              transition: "all 0.15s",
                            }}
                          >
                            {labels[type]}
                          </button>
                        );
                      })}
                    </div>
                    {data.salaryType && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", animation: "stepIn 0.2s ease" }}>
                        <input
                          type="number"
                          value={data.salary}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => set("salary", e.target.value)}
                          placeholder={data.salaryType === "percent" ? "25" : data.salaryType === "hourly" ? "500" : "50000"}
                          style={{
                            flex: 1, padding: "11px 13px",
                            background: "rgba(26,26,26,0.025)", border: "1.5px solid rgba(26,26,26,0.09)",
                            borderRadius: "12px", fontSize: "14px", fontWeight: 600, color: "#1A1A1A",
                            outline: "none", fontFamily: "Manrope, sans-serif",
                          }}
                        />
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "#AAAAAA", padding: "0 6px" }}>
                          {data.salaryType === "percent" ? "%" : data.salaryType === "hourly" ? "₽/ч" : "₽"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ══════════ STEP 4 ══════════ */}
              {step === 4 && (
                <div>
                  <h3 style={{ fontSize: "20px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.6px", margin: "0 0 4px" }}>
                    Отлично!{" "}
                    <span style={{ color: "#FCAE91" }}>{data.name.split(" ")[0] || "Сотрудник"}</span> добавлен
                  </h3>
                  <p style={{ fontSize: "12px", color: "#AAA", margin: "0 0 20px", lineHeight: 1.6 }}>
                    Теперь пригласите сотрудника присоединиться к системе
                  </p>

                  {/* Invite link */}
                  <div style={{
                    padding: "16px 18px",
                    background: "rgba(26,26,26,0.025)", borderRadius: "14px",
                    border: "1.5px solid rgba(26,26,26,0.08)", marginBottom: "14px",
                  }}>
                    <p style={{ fontSize: "10px", fontWeight: 700, color: "#AAA", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 7px" }}>
                      Ссылка-приглашение
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{
                        flex: 1, padding: "9px 12px", background: "white",
                        border: "1px solid #F0EDE8", borderRadius: "10px",
                        fontSize: "11px", fontWeight: 600, color: "#999", fontFamily: "monospace",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {inviteLink}
                      </div>
                      <button type="button" onClick={() => navigator.clipboard?.writeText(inviteLink)} style={{
                        padding: "9px 13px",
                        background: "rgba(252,174,145,0.12)", border: "1.5px solid rgba(252,174,145,0.3)",
                        borderRadius: "10px", fontSize: "12px", fontWeight: 700, color: "#F9A08B",
                        cursor: "pointer", fontFamily: "Manrope, sans-serif",
                        transition: "all 0.15s", whiteSpace: "nowrap",
                      }}>
                        Копировать
                      </button>
                    </div>
                  </div>

                  {/* Send options */}
                  <p style={{ fontSize: "10px", fontWeight: 700, color: "#AAAAAA", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 9px" }}>
                    Отправить приглашение
                  </p>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                    <button type="button" disabled={!data.phone} style={{
                      flex: 1, padding: "12px 14px",
                      background: data.phone ? "rgba(37,211,102,0.08)" : "rgba(26,26,26,0.03)",
                      border: data.phone ? "1.5px solid rgba(37,211,102,0.3)" : "1.5px solid rgba(26,26,26,0.07)",
                      borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                      cursor: data.phone ? "pointer" : "default",
                      fontFamily: "Manrope, sans-serif", fontSize: "13px", fontWeight: 600,
                      color: data.phone ? "#25d366" : "#CCC", transition: "all 0.15s",
                    }}>
                      <svg viewBox="0 0 24 24" width="15" height="15" fill={data.phone ? "#25d366" : "#CCC"}>
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.464 3.49" />
                      </svg>
                      WhatsApp
                      {!data.phone && <span style={{ fontSize: "10px", opacity: 0.6 }}>(нет номера)</span>}
                    </button>
                    <button type="button" disabled={!data.email} style={{
                      flex: 1, padding: "12px 14px",
                      background: data.email ? "rgba(252,174,145,0.08)" : "rgba(26,26,26,0.03)",
                      border: data.email ? "1.5px solid rgba(252,174,145,0.3)" : "1.5px solid rgba(26,26,26,0.07)",
                      borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                      cursor: data.email ? "pointer" : "default",
                      fontFamily: "Manrope, sans-serif", fontSize: "13px", fontWeight: 600,
                      color: data.email ? "#F9A08B" : "#CCC", transition: "all 0.15s",
                    }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={data.email ? "#F9A08B" : "#CCC"} strokeWidth="2">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                      </svg>
                      Email
                      {!data.email && <span style={{ fontSize: "10px", opacity: 0.6 }}>(нет почты)</span>}
                    </button>
                  </div>

                  <div style={{
                    padding: "13px 16px",
                    background: "rgba(163,201,168,0.08)", borderRadius: "12px",
                    border: "1px solid rgba(163,201,168,0.2)",
                  }}>
                    <p style={{ fontSize: "11.5px", color: "#666", margin: 0, lineHeight: 1.6 }}>
                      Сотрудник перейдёт по ссылке, создаст аккаунт и сразу появится в системе. Если номер телефона указан верно — сообщение придёт в WhatsApp автоматически.
                    </p>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ── ACTION BUTTONS ── */}
          <div style={{
            display: "flex", alignItems: "center", gap: "10px",
            marginTop: "20px", paddingTop: "16px",
            borderTop: "1px solid #F0EDE8",
            flexShrink: 0,
          }}>
            {step > 1 && step < 4 && (
              <button type="button" className="as-back-btn" onClick={goBack} style={{
                padding: "12px 16px",
                background: "transparent", border: "1.5px solid #EEEBE6", borderRadius: "12px",
                fontSize: "13px", fontWeight: 600, color: "#888", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "5px",
                fontFamily: "Manrope, sans-serif", transition: "all 0.15s", flexShrink: 0,
              }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Назад
              </button>
            )}

            <button
              type="button"
              disabled={
                (step === 1 && !canStep1) ||
                (step === 2 && !canStep2) ||
                (step === 3 && !canStep3)
              }
              onClick={step === 4 ? handleFinish : goNext}
              style={{
                flex: 1, padding: "13px 22px",
                background: step === 4
                  ? "linear-gradient(135deg, #A3C9A8, #7aab80)"
                  : "linear-gradient(135deg, #FCAE91, #F9A08B)",
                border: "none", borderRadius: "12px",
                fontSize: "14px", fontWeight: 700, color: "white",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                letterSpacing: "-0.1px",
                boxShadow: step === 4 ? "0 8px 24px rgba(163,201,168,0.35)" : "0 8px 24px rgba(252,174,145,0.32)",
                transition: "all 0.2s ease",
                fontFamily: "Manrope, sans-serif",
                opacity: ((step === 1 && !canStep1) || (step === 2 && !canStep2) || (step === 3 && !canStep3)) ? 0.4 : 1,
              }}
            >
              {step === 4 ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Готово, закрыть
                </>
              ) : step === 3 ? "Завершить" : "Продолжить"}
              {step !== 4 && step !== 3 && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M6 4L10 8L6 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              // Добавь отдельно для шага 3:
              {step === 3 && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M6 4L10 8L6 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>

          <p style={{ textAlign: "center", fontSize: "10px", color: "#CCCCCC", margin: "7px 0 0", fontWeight: 500 }}>
            {step}/4 — займёт около 2 минут
          </p>
        </div>

      </div>
    </div>
  );
}