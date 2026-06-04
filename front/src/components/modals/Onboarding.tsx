import React, { useState, useEffect, useRef } from "react";
import "./App.css";

// ─── TYPES ────────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3;

interface OnboardingData {
  studioName: string;
  phone: string;
  businessType: string;
  businessSubtype: string;
  timezone: string;
  language: string;
  currency: string;
}

// ─── BUSINESS CATEGORIES ─────────────────────────────────────────────────────
const BUSINESS_CATEGORIES = [
  {
    id: "fitness",
    icon: "🏋️",
    label: "Фитнес и спорт",
    subtypes: ["Тренажёрный зал", "CrossFit", "Бокс / MMA", "Йога", "Пилатес", "Стретчинг", "Танцы", "Плавание / бассейн", "Теннис", "Гольф"],
  },
  {
    id: "beauty",
    icon: "💆",
    label: "Красота и уход",
    subtypes: ["Салон красоты", "Барбершоп", "Nail-студия", "Татуировки / пирсинг", "Брови и ресницы", "SPA-студия", "Массаж", "Эпиляция / шугаринг"],
  },
  {
    id: "medical",
    icon: "🏥",
    label: "Медицина",
    subtypes: ["Клиника", "Стоматология", "Психотерапия", "Физиотерапия", "Косметология", "Дерматология", "Диетология", "Офтальмология"],
  },
  {
    id: "education",
    icon: "📚",
    label: "Образование",
    subtypes: ["Языковая школа", "Репетиторство", "Детский центр", "Музыкальная школа", "Онлайн-курсы", "Бизнес-коучинг", "Арт-студия", "IT-обучение"],
  },
  {
    id: "pets",
    icon: "🐾",
    label: "Ветеринария и животные",
    subtypes: ["Ветклиника", "Груминг", "Зоогостиница", "Кинология / дрессировка", "Зоосалон"],
  },
  {
    id: "auto",
    icon: "🚗",
    label: "Авто",
    subtypes: ["Автомойка", "СТО", "Детейлинг", "Шиномонтаж", "Автошкола"],
  },
  {
    id: "other",
    icon: "✦",
    label: "Другое",
    subtypes: ["Фотостудия", "Коворкинг", "Квест-комната", "Бьюти-бокс", "Иное"],
  },
];

const TIMEZONES = [
  { value: "UTC+3", label: "Москва (UTC+3)" },
  { value: "UTC+2", label: "Калининград (UTC+2)" },
  { value: "UTC+4", label: "Самара (UTC+4)" },
  { value: "UTC+5", label: "Екатеринбург (UTC+5)" },
  { value: "UTC+6", label: "Омск (UTC+6)" },
  { value: "UTC+7", label: "Красноярск (UTC+7)" },
  { value: "UTC+8", label: "Иркутск (UTC+8)" },
  { value: "UTC+9", label: "Якутск (UTC+9)" },
  { value: "UTC+10", label: "Владивосток (UTC+10)" },
  { value: "UTC+11", label: "Магадан (UTC+11)" },
  { value: "UTC+12", label: "Камчатка (UTC+12)" },
  { value: "UTC+1", label: "Центральная Европа (UTC+1)" },
  { value: "UTC+0", label: "Лондон (UTC+0)" },
  { value: "UTC-5", label: "Нью-Йорк (UTC-5)" },
  { value: "UTC-8", label: "Лос-Анджелес (UTC-8)" },
];

const LANGUAGES = [
  { value: "ru", label: "Русский", flag: "🇷🇺" },
  { value: "en", label: "English", flag: "🇬🇧" },
  { value: "uk", label: "Українська", flag: "🇺🇦" },
  { value: "kz", label: "Қазақша", flag: "🇰🇿" },
  { value: "de", label: "Deutsch", flag: "🇩🇪" },
  { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "es", label: "Español", flag: "🇪🇸" },
  { value: "ar", label: "العربية", flag: "🇦🇪" },
];

const CURRENCIES = [
  { value: "RUB", label: "Рубль", symbol: "₽" },
  { value: "USD", label: "Доллар", symbol: "$" },
  { value: "EUR", label: "Евро", symbol: "€" },
  { value: "KZT", label: "Тенге", symbol: "₸" },
  { value: "UAH", label: "Гривна", symbol: "₴" },
  { value: "GBP", label: "Фунт", symbol: "£" },
  { value: "AED", label: "Дирхам", symbol: "د.إ" },
  { value: "TRY", label: "Лира", symbol: "₺" },
];

// ─── STEP 1 ILLUSTRATION ─────────────────────────────────────────────────────
function Step1Illustration() {
  return (
    <svg viewBox="0 0 320 280" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      <defs>
        <radialGradient id="bg-glow" cx="50%" cy="55%" r="50%">
          <stop offset="0%" stopColor="#FCAE91" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#FCAE91" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="card-shine" cx="30%" cy="20%" r="70%">
          <stop offset="0%" stopColor="white" stopOpacity="0.9" />
          <stop offset="100%" stopColor="white" stopOpacity="0.7" />
        </radialGradient>
      </defs>

      {/* Background glow */}
      <ellipse cx="160" cy="160" rx="140" ry="120" fill="url(#bg-glow)" />

      {/* Floating orbs */}
      <circle cx="52" cy="68" r="6" fill="#FCAE91" opacity="0.4">
        <animateTransform attributeName="transform" type="translate" values="0,0;0,-8;0,0" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx="268" cy="200" r="4" fill="#FCAE91" opacity="0.3">
        <animateTransform attributeName="transform" type="translate" values="0,0;0,6;0,0" dur="4s" repeatCount="indefinite" />
      </circle>
      <circle cx="290" cy="80" r="8" fill="#A3C9A8" opacity="0.25">
        <animateTransform attributeName="transform" type="translate" values="0,0;4,0;0,0" dur="5s" repeatCount="indefinite" />
      </circle>

      {/* Main card (studio card) */}
      <g>
        <rect x="54" y="72" width="212" height="136" rx="18" fill="url(#card-shine)" />
        <rect x="54" y="72" width="212" height="136" rx="18" stroke="#F0EDE8" strokeWidth="1" />
        {/* Card shadow */}
        <rect x="64" y="82" width="212" height="136" rx="18" fill="#1A1A1A" opacity="0.06" />

        {/* Studio name area */}
        <rect x="72" y="92" width="120" height="10" rx="5" fill="#1A1A1A" opacity="0.12" />
        <rect x="72" y="108" width="80" height="7" rx="3.5" fill="#FCAE91" opacity="0.5" />

        {/* Divider */}
        <line x1="72" y1="126" x2="248" y2="126" stroke="#F0EDE8" strokeWidth="1" />

        {/* Info rows */}
        <rect x="72" y="136" width="14" height="14" rx="4" fill="#FCAE91" opacity="0.3" />
        <rect x="94" y="139" width="90" height="7" rx="3.5" fill="#1A1A1A" opacity="0.1" />

        <rect x="72" y="158" width="14" height="14" rx="4" fill="#A3C9A8" opacity="0.4" />
        <rect x="94" y="161" width="70" height="7" rx="3.5" fill="#1A1A1A" opacity="0.1" />

        {/* Phone badge */}
        <rect x="168" y="152" width="72" height="24" rx="8" fill="#1A1A1A" opacity="0.06" />
        <rect x="176" y="158" width="56" height="7" rx="3.5" fill="#1A1A1A" opacity="0.12" />

        {/* Avatar placeholder */}
        <circle cx="236" cy="104" r="16" fill="#F5F0EB" />
        <circle cx="236" cy="100" r="6" fill="#FCAE91" opacity="0.5" />
        <ellipse cx="236" cy="116" rx="10" ry="6" fill="#FCAE91" opacity="0.3" />
      </g>

      {/* Floating mini-card top-right */}
      <g opacity="0.85">
        <animateTransform attributeName="transform" type="translate" values="0,0;3,-5;0,0" dur="4s" repeatCount="indefinite" additive="sum" />
        <rect x="210" y="44" width="88" height="44" rx="12" fill="white" />
        <rect x="210" y="44" width="88" height="44" rx="12" stroke="#F0EDE8" strokeWidth="1" />
        <rect x="222" y="56" width="40" height="6" rx="3" fill="#1A1A1A" opacity="0.12" />
        <rect x="222" y="66" width="28" height="5" rx="2.5" fill="#FCAE91" opacity="0.6" />
        <circle cx="279" cy="62" r="8" fill="#F5F0EB" />
        <path d="M276 62 L279 65 L283 59" stroke="#A3C9A8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Floating mini-card bottom-left */}
      <g opacity="0.8">
        <animateTransform attributeName="transform" type="translate" values="0,0;-4,4;0,0" dur="5s" repeatCount="indefinite" additive="sum" />
        <rect x="24" y="180" width="76" height="40" rx="10" fill="white" />
        <rect x="24" y="180" width="76" height="40" rx="10" stroke="#F0EDE8" strokeWidth="1" />
        <rect x="34" y="190" width="34" height="5" rx="2.5" fill="#1A1A1A" opacity="0.1" />
        <rect x="34" y="199" width="24" height="5" rx="2.5" fill="#FCAE91" opacity="0.4" />
        <rect x="34" y="208" width="44" height="4" rx="2" fill="#1A1A1A" opacity="0.07" />
      </g>

      {/* Sparkles */}
      <g fill="#FCAE91">
        <path d="M36 120 L38 114 L40 120 L46 122 L40 124 L38 130 L36 124 L30 122 Z" opacity="0.35">
          <animateTransform attributeName="transform" type="rotate" values="0 38 122;360 38 122" dur="8s" repeatCount="indefinite" />
        </path>
        <path d="M270 136 L271.5 132 L273 136 L277 137.5 L273 139 L271.5 143 L270 139 L266 137.5 Z" opacity="0.25">
          <animateTransform attributeName="transform" type="rotate" values="360 271.5 137.5;0 271.5 137.5" dur="10s" repeatCount="indefinite" />
        </path>
      </g>
    </svg>
  );
}

// ─── STEP 2 ILLUSTRATION ─────────────────────────────────────────────────────
function Step2Illustration({ selected }: { selected: string }) {
  const icons: Record<string, string> = {
    fitness: "🏋️",
    beauty: "💆",
    medical: "🏥",
    education: "📚",
    pets: "🐾",
    auto: "🚗",
    other: "✦",
  };
  const selectedIcon = icons[selected] || "✦";

  return (
    <svg viewBox="0 0 320 280" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      <defs>
        <radialGradient id="bg-glow2" cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#FCAE91" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#FCAE91" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="160" cy="145" rx="130" ry="110" fill="url(#bg-glow2)" />

      {/* Center icon ring */}
      <circle cx="160" cy="140" r="52" fill="white" />
      <circle cx="160" cy="140" r="52" stroke="#F0EDE8" strokeWidth="1.5" />
      <circle cx="160" cy="140" r="40" fill="#FDFCFB" />
      <text x="160" y="155" textAnchor="middle" fontSize="34">{selectedIcon || "?"}</text>

      {/* Orbiting category dots */}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const angle = (i / 7) * Math.PI * 2 - Math.PI / 2;
        const r = 90;
        const x = 160 + Math.cos(angle) * r;
        const y = 140 + Math.sin(angle) * r;
        const cat = BUSINESS_CATEGORIES[i];
        const isSelected = selected === cat?.id;
        return (
          <g key={i}>
            <circle
              cx={x}
              cy={y}
              r={isSelected ? 20 : 15}
              fill={isSelected ? "#FCAE91" : "white"}
              stroke={isSelected ? "#F9A08B" : "#F0EDE8"}
              strokeWidth={isSelected ? 2 : 1}
              opacity={isSelected ? 1 : 0.7}
            />
            <text x={x} y={y + 5} textAnchor="middle" fontSize={isSelected ? "14" : "12"}>
              {cat?.icon}
            </text>
          </g>
        );
      })}

      {/* Connecting lines from center to selected */}
      {selected && BUSINESS_CATEGORIES.map((cat, i) => {
        if (cat.id !== selected) return null;
        const angle = (i / 7) * Math.PI * 2 - Math.PI / 2;
        const r = 70;
        const x = 160 + Math.cos(angle) * r;
        const y = 140 + Math.sin(angle) * r;
        return (
          <line
            key={cat.id}
            x1="160" y1="140"
            x2={x} y2={y}
            stroke="#FCAE91"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            opacity="0.5"
          />
        );
      })}

      {/* Label below */}
      {selected && (
        <g>
          <rect x="90" y="215" width="140" height="28" rx="8" fill="#FCAE91" opacity="0.12" />
          <text x="160" y="233" textAnchor="middle" fontSize="12" fill="#1A1A1A" fontWeight="600" opacity="0.6">
            {BUSINESS_CATEGORIES.find(c => c.id === selected)?.label}
          </text>
        </g>
      )}
    </svg>
  );
}

// ─── STEP 3 ILLUSTRATION ─────────────────────────────────────────────────────
function Step3Illustration() {
  return (
    <svg viewBox="0 0 320 280" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      <defs>
        <radialGradient id="globe-grad" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#E8F5FF" />
          <stop offset="100%" stopColor="#C5E4FF" />
        </radialGradient>
        <radialGradient id="bg-glow3" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FCAE91" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#FCAE91" stopOpacity="0" />
        </radialGradient>
        <clipPath id="globe-clip">
          <circle cx="160" cy="132" r="72" />
        </clipPath>
      </defs>

      <ellipse cx="160" cy="145" rx="140" ry="115" fill="url(#bg-glow3)" />

      {/* Globe base */}
      <circle cx="160" cy="132" r="72" fill="url(#globe-grad)" />
      <circle cx="160" cy="132" r="72" stroke="#D0E8F8" strokeWidth="1.5" />

      {/* Continents (simplified shapes) */}
      <g clipPath="url(#globe-clip)" opacity="0.6">
        {/* Eurasia */}
        <path d="M152 90 C165 84 185 86 198 92 C208 96 212 106 210 114 C208 122 200 126 190 124 C178 122 168 128 162 124 C154 120 148 112 150 104 C152 98 150 94 152 90 Z"
          fill="#A3C9A8" opacity="0.5" />
        {/* Africa */}
        <path d="M148 118 C152 114 160 116 164 122 C168 130 166 142 160 146 C154 150 146 146 144 138 C142 130 144 122 148 118 Z"
          fill="#A3C9A8" opacity="0.45" />
        {/* Americas */}
        <path d="M110 96 C116 92 122 96 124 104 C126 112 122 122 116 126 C110 130 104 126 104 118 C104 110 106 100 110 96 Z"
          fill="#A3C9A8" opacity="0.4" />
        {/* Australia */}
        <path d="M194 136 C200 134 206 138 206 144 C206 150 200 154 194 152 C188 150 186 144 190 140 L194 136 Z"
          fill="#A3C9A8" opacity="0.4" />
      </g>

      {/* Latitude lines */}
      <g clipPath="url(#globe-clip)" opacity="0.2">
        {[-40, -20, 0, 20, 40].map((lat, i) => (
          <ellipse
            key={i}
            cx="160"
            cy={132 + lat}
            rx={Math.sqrt(72 * 72 - lat * lat) * 0.98}
            ry="4"
            fill="none"
            stroke="#4A9CD6"
            strokeWidth="0.5"
          />
        ))}
      </g>

      {/* Longitude lines */}
      <g clipPath="url(#globe-clip)" opacity="0.15">
        {[-40, -20, 0, 20, 40].map((lon, i) => (
          <ellipse
            key={i}
            cx="160"
            cy="132"
            rx="4"
            ry="72"
            fill="none"
            stroke="#4A9CD6"
            strokeWidth="0.5"
            transform={`rotate(${(lon / 90) * 45} 160 132)`}
          />
        ))}
      </g>

      {/* Globe shine */}
      <circle cx="135" cy="110" r="20" fill="white" opacity="0.15" />

      {/* Location pin */}
      <g>
        <animateTransform attributeName="transform" type="translate" values="0,0;0,-4;0,0" dur="2s" repeatCount="indefinite" additive="sum" />
        <path d="M160 92 C153 92 148 97 148 104 C148 114 160 124 160 124 C160 124 172 114 172 104 C172 97 167 92 160 92 Z"
          fill="#FCAE91" />
        <circle cx="160" cy="104" r="5" fill="white" />
      </g>

      {/* Floating flags / locale chips */}
      <g opacity="0.9">
        <animateTransform attributeName="transform" type="translate" values="0,0;-3,-4;0,0" dur="3.5s" repeatCount="indefinite" additive="sum" />
        <rect x="20" y="84" width="68" height="26" rx="8" fill="white" />
        <rect x="20" y="84" width="68" height="26" rx="8" stroke="#F0EDE8" strokeWidth="1" />
        <text x="32" y="100" fontSize="13">🇷🇺</text>
        <rect x="50" y="93" width="30" height="5" rx="2.5" fill="#1A1A1A" opacity="0.15" />
      </g>

      <g opacity="0.85">
        <animateTransform attributeName="transform" type="translate" values="0,0;4,-3;0,0" dur="4.5s" repeatCount="indefinite" additive="sum" />
        <rect x="232" y="68" width="72" height="26" rx="8" fill="white" />
        <rect x="232" y="68" width="72" height="26" rx="8" stroke="#F0EDE8" strokeWidth="1" />
        <text x="244" y="84" fontSize="13">💰</text>
        <text x="264" y="84" fontSize="10" fill="#1A1A1A" opacity="0.4" fontWeight="600">RUB ₽</text>
      </g>

      <g opacity="0.8">
        <animateTransform attributeName="transform" type="translate" values="0,0;3,5;0,0" dur="5s" repeatCount="indefinite" additive="sum" />
        <rect x="238" y="168" width="72" height="26" rx="8" fill="white" />
        <rect x="238" y="168" width="72" height="26" rx="8" stroke="#F0EDE8" strokeWidth="1" />
        <text x="250" y="184" fontSize="13">🕐</text>
        <rect x="270" y="179" width="32" height="5" rx="2.5" fill="#1A1A1A" opacity="0.15" />
      </g>

      {/* Bottom label */}
      <rect x="100" y="222" width="120" height="28" rx="8" fill="#1A1A1A" opacity="0.04" />
      <text x="160" y="240" textAnchor="middle" fontSize="11" fill="#1A1A1A" opacity="0.35" fontWeight="500">
        Ваши настройки региона
      </text>
    </svg>
  );
}

// ─── PHONE FORMATTER ─────────────────────────────────────────────────────────
function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 1) return "+" + digits;
  if (digits.length <= 4) return "+" + digits[0] + " (" + digits.slice(1);
  if (digits.length <= 7) return "+" + digits[0] + " (" + digits.slice(1, 4) + ") " + digits.slice(4);
  if (digits.length <= 9) return "+" + digits[0] + " (" + digits.slice(1, 4) + ") " + digits.slice(4, 7) + "-" + digits.slice(7);
  return "+" + digits[0] + " (" + digits.slice(1, 4) + ") " + digits.slice(4, 7) + "-" + digits.slice(7, 9) + "-" + digits.slice(9);
}

// ─── STEP INDICATOR ──────────────────────────────────────────────────────────
function StepIndicator({ current, total }: { current: Step; total: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      {Array.from({ length: total }, (_, i) => {
        const step = (i + 1) as Step;
        const isDone = current > step;
        const isActive = current === step;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{
              width: isActive ? "28px" : "8px",
              height: "8px",
              borderRadius: "4px",
              background: isActive ? "#FCAE91" : isDone ? "#A3C9A8" : "#E8E4DF",
              transition: "all 0.4s cubic-bezier(0.34,1.1,0.64,1)",
            }} />
          </div>
        );
      })}
    </div>
  );
}

// ─── SELECT COMPONENT ────────────────────────────────────────────────────────
function PremiumSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; symbol?: string; flag?: string }[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          padding: "13px 16px",
          background: "white",
          border: open ? "1.5px solid #FCAE91" : "1.5px solid #EEEBE6",
          borderRadius: "12px",
          fontSize: "15px",
          color: selected ? "#1A1A1A" : "#AAAAAA",
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          transition: "all 0.2s ease",
          boxShadow: open ? "0 0 0 4px rgba(252,174,145,0.12)" : "none",
          outline: "none",
          fontFamily: "inherit",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {selected?.flag && <span>{selected.flag}</span>}
          {selected?.symbol && (
            <span style={{
              width: "22px", height: "22px",
              background: "rgba(252,174,145,0.15)",
              borderRadius: "6px",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "12px", fontWeight: 700, color: "#FCAE91",
            }}>{selected.symbol}</span>
          )}
          {selected?.label || placeholder}
        </span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s ease",
          flexShrink: 0,
        }}>
          <path d="M4 6L8 10L12 6" stroke="#AAAAAA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          left: 0, right: 0,
          background: "white",
          border: "1.5px solid #EEEBE6",
          borderRadius: "14px",
          zIndex: 100,
          maxHeight: "200px",
          overflowY: "auto",
          boxShadow: "0 16px 48px rgba(26,26,26,0.12)",
          animation: "dropDown 0.15s cubic-bezier(0.34,1.1,0.64,1)",
        }}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                width: "100%",
                padding: "10px 14px",
                background: opt.value === value ? "rgba(252,174,145,0.08)" : "transparent",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                fontSize: "14px",
                color: "#1A1A1A",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontFamily: "inherit",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = opt.value === value ? "rgba(252,174,145,0.1)" : "rgba(0,0,0,0.03)")}
              onMouseLeave={e => (e.currentTarget.style.background = opt.value === value ? "rgba(252,174,145,0.08)" : "transparent")}
            >
              {opt.flag && <span>{opt.flag}</span>}
              {opt.symbol && (
                <span style={{
                  width: "22px", height: "22px",
                  background: opt.value === value ? "rgba(252,174,145,0.2)" : "rgba(0,0,0,0.05)",
                  borderRadius: "6px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "11px", fontWeight: 700,
                  color: opt.value === value ? "#F9A08B" : "#888",
                }}>{opt.symbol}</span>
              )}
              {opt.label}
              {opt.value === value && (
                <svg style={{ marginLeft: "auto" }} width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2.5 7L5.5 10L11.5 4" stroke="#FCAE91" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MAIN MODAL ───────────────────────────────────────────────────────────────
export default function OnboardingModal({ onComplete }: { onComplete?: (data: OnboardingData) => void }) {
  const [step, setStep] = useState<Step>(1);
  const [dir, setDir] = useState<1 | -1>(1);
  const [animating, setAnimating] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    studioName: "",
    phone: "",
    businessType: "",
    businessSubtype: "",
    timezone: "UTC+3",
    language: "ru",
    currency: "RUB",
  });

  // Focus glow states
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const selectedCategory = BUSINESS_CATEGORIES.find(c => c.id === data.businessType);

  function goNext() {
    if (animating) return;
    setDir(1);
    setAnimating(true);
    setTimeout(() => {
      setStep(s => Math.min(s + 1, 3) as Step);
      setAnimating(false);
    }, 220);
  }

  function goBack() {
    if (animating || step === 1) return;
    setDir(-1);
    setAnimating(true);
    setTimeout(() => {
      setStep(s => Math.max(s - 1, 1) as Step);
      setAnimating(false);
    }, 220);
  }

  function handleFinish() {
    onComplete?.(data);
  }

  const canProceedStep1 = data.studioName.trim().length >= 2 && data.phone.replace(/\D/g, "").length >= 10;
  const canProceedStep2 = data.businessType !== "" && data.businessSubtype !== "";
  const canProceedStep3 = data.timezone && data.language && data.currency;

  const inputStyle = (field: string): React.CSSProperties => ({
    width: "100%",
    padding: "13px 16px",
    background: "white",
    border: focusedField === field ? "1.5px solid #FCAE91" : "1.5px solid #EEEBE6",
    borderRadius: "12px",
    fontSize: "15px",
    color: "#1A1A1A",
    outline: "none",
    transition: "all 0.2s ease",
    boxSizing: "border-box",
    boxShadow: focusedField === field ? "0 0 0 4px rgba(252,174,145,0.12)" : "none",
    fontFamily: "inherit",
  });

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "12px",
    fontWeight: 700,
    color: "#666",
    letterSpacing: "0.5px",
    textTransform: "uppercase" as const,
    marginBottom: "8px",
  };

  return (
    <div
      className="velora-modal"
      style={{
        width: "100%",
        maxWidth: "900px",
        minHeight: "540px",
        background: "#FDFCFB",
        borderRadius: "24px",
        boxShadow: "0 48px 120px rgba(26,26,26,0.18), 0 8px 32px rgba(26,26,26,0.08)",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        overflow: "hidden",
        animation: "modalIn 0.45s cubic-bezier(0.34,1.1,0.64,1)",
        position: "relative",
      }}
    >
      {/* ── LEFT PANEL (Illustration) ── */}
      <div style={{
        background: "white",
        padding: "48px 40px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        borderRight: "1px solid #F0EDE8",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Subtle mesh background */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `
            radial-gradient(circle at 20% 20%, rgba(252,174,145,0.06) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(163,201,168,0.06) 0%, transparent 50%)
          `,
          pointerEvents: "none",
        }} />

        {/* Logo */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "34px", height: "34px",
              background: "linear-gradient(135deg, #FCAE91, #F9A08B)",
              borderRadius: "10px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M3 9C3 5.69 5.69 3 9 3s6 2.69 6 6-2.69 6-6 6-6-2.69-6-6Z" fill="white" opacity="0.3" />
                <path d="M9 5.5C9 5.5 12 7 12 9.5C12 11.5 10.5 13 9 13C7.5 13 6 11.5 6 9.5C6 7 9 5.5 9 5.5Z" fill="white" />
              </svg>
            </div>
            <span style={{ fontWeight: 800, fontSize: "18px", color: "#1A1A1A", letterSpacing: "-0.5px" }}>Velora</span>
          </div>

          <div style={{ marginTop: "32px" }}>
            <p style={{
              fontSize: "11px", fontWeight: 700, color: "#FCAE91",
              letterSpacing: "2px", textTransform: "uppercase", marginBottom: "8px",
            }}>
              Шаг {step} из 3
            </p>
            <h2 style={{
              fontSize: "22px", fontWeight: 900, color: "#1A1A1A",
              letterSpacing: "-0.8px", lineHeight: "1.25",
              margin: "0 0 10px",
            }}>
              {step === 1 && "О вашем\nбизнесе"}
              {step === 2 && "Сфера\nдеятельности"}
              {step === 3 && "Регион и\nязык"}
            </h2>
            <p style={{ fontSize: "13px", color: "#888", lineHeight: "1.6", margin: 0 }}>
              {step === 1 && "Как нам называть вас? Введите название компании и номер телефона."}
              {step === 2 && "Выберите сферу, чтобы мы настроили CRM идеально под вас."}
              {step === 3 && "Последний шаг — региональные настройки для удобной работы."}
            </p>
          </div>

          {/* Step progress dots */}
          <div style={{ marginTop: "28px" }}>
            <StepIndicator current={step} total={3} />
          </div>
        </div>

        {/* Illustration */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px 0",
          position: "relative", zIndex: 1,
        }}>
          {step === 1 && <Step1Illustration />}
          {step === 2 && <Step2Illustration selected={data.businessType} />}
          {step === 3 && <Step3Illustration />}
        </div>

        {/* Bottom trust signal */}
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "12px 14px",
          background: "rgba(163,201,168,0.1)",
          borderRadius: "10px",
          position: "relative", zIndex: 1,
        }}>
          <div style={{
            width: "8px", height: "8px",
            borderRadius: "50%",
            background: "#A3C9A8",
            animation: "stepPulse 2s infinite",
          }} />
          <span style={{ fontSize: "12px", color: "#666", fontWeight: 500 }}>
            Данные защищены и не передаются третьим лицам
          </span>
        </div>
      </div>

      {/* ── RIGHT PANEL (Form) ── */}
      <div style={{
        padding: "48px 44px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Step content with animation */}
        <div
          key={step}
          style={{
            flex: 1,
            animation: animating
              ? (dir === 1 ? "slideOutRight 0.2s ease forwards" : "slideOutLeft 0.2s ease forwards")
              : (dir === 1 ? "slideInRight 0.3s cubic-bezier(0.34,1.1,0.64,1)" : "slideInLeft 0.3s cubic-bezier(0.34,1.1,0.64,1)"),
          }}
        >
          {/* ── STEP 1 ── */}
          {step === 1 && (
            <div>
              <div style={{ marginBottom: "32px" }}>
                <h3 style={{
                  fontSize: "26px", fontWeight: 900, color: "#1A1A1A",
                  letterSpacing: "-1px", margin: "0 0 8px",
                }}>
                  Добро пожаловать 👋
                </h3>
                <p style={{ fontSize: "14px", color: "#888", margin: 0, lineHeight: "1.6" }}>
                  Пара минут настройки — и ваш рабочий инструмент готов
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <label style={labelStyle}>Название студии или компании</label>
                  <input
                    style={inputStyle("name")}
                    type="text"
                    placeholder="Например: Studio Forma"
                    value={data.studioName}
                    onFocus={() => setFocusedField("name")}
                    onBlur={() => setFocusedField(null)}
                    onChange={e => setData(d => ({ ...d, studioName: e.target.value }))}
                    autoFocus
                  />
                </div>

                <div>
                  <label style={labelStyle}>Номер телефона</label>
                  <div style={{ position: "relative" }}>
                    <div style={{
                      position: "absolute", left: "14px", top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: "16px",
                      pointerEvents: "none",
                    }}>📞</div>
                    <input
                      style={{ ...inputStyle("phone"), paddingLeft: "42px" }}
                      type="tel"
                      placeholder="+7 (900) 000-00-00"
                      value={data.phone}
                      onFocus={() => setFocusedField("phone")}
                      onBlur={() => setFocusedField(null)}
                      onChange={e => setData(d => ({ ...d, phone: formatPhone(e.target.value) }))}
                    />
                  </div>
                  <p style={{ fontSize: "11px", color: "#AAAAAA", marginTop: "6px", marginBottom: 0 }}>
                    Для двухфакторной аутентификации и уведомлений
                  </p>
                </div>

                {/* Preview card */}
                {data.studioName.trim().length > 0 && (
                  <div style={{
                    padding: "16px 18px",
                    background: "linear-gradient(135deg, rgba(252,174,145,0.08), rgba(163,201,168,0.05))",
                    borderRadius: "14px",
                    border: "1.5px solid rgba(252,174,145,0.2)",
                    animation: "slideInRight 0.25s ease",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{
                        width: "40px", height: "40px",
                        background: "linear-gradient(135deg, #FCAE91, #F9A08B)",
                        borderRadius: "12px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "18px", fontWeight: 900, color: "white",
                      }}>
                        {data.studioName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "14px", color: "#1A1A1A" }}>
                          {data.studioName}
                        </div>
                        <div style={{ fontSize: "12px", color: "#AAAAAA" }}>
                          {data.phone || "Телефон не указан"}
                        </div>
                      </div>
                      <div style={{
                        marginLeft: "auto",
                        padding: "3px 8px",
                        background: "rgba(163,201,168,0.2)",
                        borderRadius: "6px",
                        fontSize: "10px",
                        fontWeight: 700,
                        color: "#5A8A60",
                        letterSpacing: "0.5px",
                      }}>
                        НОВЫЙ
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: "24px" }}>
                <h3 style={{
                  fontSize: "24px", fontWeight: 900, color: "#1A1A1A",
                  letterSpacing: "-0.8px", margin: "0 0 6px",
                }}>
                  Чем занимается бизнес?
                </h3>
                <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
                  Выберите категорию и конкретный тип
                </p>
              </div>

              {/* Category grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
                marginBottom: "16px",
              }}>
                {BUSINESS_CATEGORIES.map((cat) => {
                  const isSelected = data.businessType === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className="business-chip"
                      onClick={() => setData(d => ({ ...d, businessType: cat.id, businessSubtype: "" }))}
                      style={{
                        padding: "11px 14px",
                        background: isSelected ? "rgba(252,174,145,0.1)" : "white",
                        border: isSelected ? "1.5px solid #FCAE91" : "1.5px solid #EEEBE6",
                        borderRadius: "12px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        textAlign: "left",
                        fontFamily: "inherit",
                      }}
                    >
                      <span style={{ fontSize: "18px", lineHeight: 1 }}>{cat.icon}</span>
                      <span style={{
                        fontSize: "12px",
                        fontWeight: isSelected ? 700 : 500,
                        color: isSelected ? "#1A1A1A" : "#555",
                        lineHeight: "1.3",
                      }}>{cat.label}</span>
                      {isSelected && (
                        <div style={{
                          marginLeft: "auto",
                          width: "16px", height: "16px",
                          background: "#FCAE91",
                          borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          animation: "checkPopRotate 0.3s cubic-bezier(0.34,1.1,0.64,1)",
                          flexShrink: 0,
                        }}>
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1 4L3 6L7 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Subtypes */}
              {selectedCategory && (
                <div style={{ animation: "slideInRight 0.25s cubic-bezier(0.34,1.1,0.64,1)" }}>
                  <label style={labelStyle}>Уточните тип</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {selectedCategory.subtypes.map((sub) => {
                      const isSubSelected = data.businessSubtype === sub;
                      return (
                        <button
                          key={sub}
                          type="button"
                          className="subtype-pill"
                          onClick={() => setData(d => ({ ...d, businessSubtype: sub }))}
                          style={{
                            padding: "6px 12px",
                            background: isSubSelected ? "rgba(252,174,145,0.15)" : "rgba(0,0,0,0.04)",
                            border: isSubSelected ? "1.5px solid #FCAE91" : "1.5px solid transparent",
                            borderRadius: "20px",
                            fontSize: "12px",
                            fontWeight: isSubSelected ? 700 : 500,
                            color: isSubSelected ? "#1A1A1A" : "#666",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {isSubSelected && "✓ "}{sub}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <div>
              <div style={{ marginBottom: "28px" }}>
                <h3 style={{
                  fontSize: "24px", fontWeight: 900, color: "#1A1A1A",
                  letterSpacing: "-0.8px", margin: "0 0 6px",
                }}>
                  Региональные настройки
                </h3>
                <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
                  Эти параметры всегда можно изменить в настройках
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                <div>
                  <label style={labelStyle}>Часовой пояс</label>
                  <PremiumSelect
                    value={data.timezone}
                    onChange={v => setData(d => ({ ...d, timezone: v }))}
                    options={TIMEZONES}
                    placeholder="Выберите часовой пояс"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Язык интерфейса</label>
                  <PremiumSelect
                    value={data.language}
                    onChange={v => setData(d => ({ ...d, language: v }))}
                    options={LANGUAGES}
                    placeholder="Выберите язык"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Валюта</label>
                  <PremiumSelect
                    value={data.currency}
                    onChange={v => setData(d => ({ ...d, currency: v }))}
                    options={CURRENCIES}
                    placeholder="Выберите валюту"
                  />
                </div>

                {/* Summary card */}
                <div style={{
                  padding: "16px 18px",
                  background: "rgba(26,26,26,0.03)",
                  borderRadius: "14px",
                  border: "1.5px solid #F0EDE8",
                }}>
                  <p style={{ fontSize: "11px", fontWeight: 700, color: "#AAAAAA", letterSpacing: "0.5px", margin: "0 0 10px", textTransform: "uppercase" }}>
                    Итог настройки
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {[
                      { label: "Компания", value: data.studioName },
                      { label: "Сфера", value: data.businessSubtype },
                      { label: "Часовой пояс", value: TIMEZONES.find(t => t.value === data.timezone)?.label.split(" ")[0] },
                      { label: "Язык", value: LANGUAGES.find(l => l.value === data.language)?.label },
                      { label: "Валюта", value: CURRENCIES.find(c => c.value === data.currency)?.label },
                    ].map((row) => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", color: "#AAAAAA" }}>{row.label}</span>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "#1A1A1A" }}>{row.value || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── ACTION BUTTONS ── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginTop: "28px",
          paddingTop: "20px",
          borderTop: "1px solid #F0EDE8",
        }}>
          {step > 1 && (
            <button
              type="button"
              className="back-btn"
              onClick={goBack}
              style={{
                padding: "14px 18px",
                background: "transparent",
                border: "1.5px solid #EEEBE6",
                borderRadius: "12px",
                fontSize: "14px",
                fontWeight: 600,
                color: "#888",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontFamily: "inherit",
                transition: "background 0.15s ease",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Назад
            </button>
          )}

          <button
            type="button"
            className="cta-btn"
            disabled={
              (step === 1 && !canProceedStep1) ||
              (step === 2 && !canProceedStep2) ||
              (step === 3 && !canProceedStep3)
            }
            onClick={step === 3 ? handleFinish : goNext}
            style={{
              flex: 1,
              padding: "14px 24px",
              background: "linear-gradient(135deg, #FCAE91, #F9A08B)",
              border: "none",
              borderRadius: "12px",
              fontSize: "15px",
              fontWeight: 700,
              color: "white",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              letterSpacing: "-0.1px",
              boxShadow: "0 8px 24px rgba(252,174,145,0.3)",
              transition: "all 0.2s ease",
              fontFamily: "inherit",
              opacity: (
                (step === 1 && !canProceedStep1) ||
                (step === 2 && !canProceedStep2) ||
                (step === 3 && !canProceedStep3)
              ) ? 0.45 : 1,
            }}
          >
            {step === 3 ? "Начать работу →" : "Продолжить"}
            {step !== 3 && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4L10 8L6 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>

        {/* Step counter */}
        <p style={{
          textAlign: "center",
          fontSize: "11px",
          color: "#CCCCCC",
          margin: "10px 0 0",
          fontWeight: 500,
        }}>
          {step}/3 — займёт меньше 2 минут
        </p>
      </div>
    </div>
  );
}