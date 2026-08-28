// ─── В самом верху UI.tsx ───
import { GoogleIcon, Droplet, Comb, Dumbbell, Sparkle, Scissors } from "./Icons"; // 🔥 Убрали неиспользуемый IconProps
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import type { ReactNode, FocusEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { placePopover } from "./ui/popoverPosition";
import { LANGUAGES } from "../utils/lang";

import PhoneInput from 'react-phone-number-input/input';
import 'react-phone-number-input/style.css';

// ─── FLOATING ORBS ────────────────────────────────────────────────────────────
export function Orbs() {
  return (
    <div className="orbs-container">
      <div className="orb" style={{ top: "-80px", right: "-100px", width: "560px", height: "560px", background: "radial-gradient(circle, rgba(249,160,139,0.15) 0%, transparent 70%)", animation: "floatLogin1 14s ease-in-out infinite" }} />
      <div className="orb" style={{ bottom: "0", left: "-120px", width: "440px", height: "440px", background: "radial-gradient(circle, rgba(163,201,168,0.10) 0%, transparent 70%)", animation: "floatLogin2 18s ease-in-out infinite" }} />
      <div className="orb" style={{ top: "40%", left: "30%", width: "280px", height: "280px", background: "radial-gradient(circle, rgba(249,160,139,0.07) 0%, transparent 60%)", animation: "floatLogin3 22s ease-in-out infinite" }} />
    </div>
  );
}

// ─── LOGO ─────────────────────────────────────────────────────────────────────
export function Logo() {
  return (
    <div className="logo">
      <div className="logo-mark">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="3" y="3" width="6" height="6" rx="2" fill="white" opacity="0.95" />
          <rect x="11" y="3" width="6" height="6" rx="2" fill="white" opacity="0.6" />
          <rect x="3" y="11" width="6" height="6" rx="2" fill="white" opacity="0.6" />
          <rect x="11" y="11" width="6" height="6" rx="2" fill="white" opacity="0.95" />
        </svg>
      </div>
      <span className="logo-text">Velora<span>.</span></span>
    </div>
  );
}

// ─── INPUT FIELD ──────────────────────────────────────────────────────────────
interface InputFieldProps {
  label?: ReactNode;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void;
  icon?: ReactNode;
  rightSlot?: ReactNode;
  error?: ReactNode;
  autoComplete?: string;
  maxLength?: number;
}

export function InputField({ label, type = "text", placeholder, value, onChange, onFocus, icon, rightSlot, error, autoComplete, maxLength }: InputFieldProps) {
  const [focused, setFocused] = useState(false);
  const hasValue = value.length > 0;

  return (
    <div className="input-wrapper">
      <label className="input-label" style={{ color: focused ? "var(--onyx)" : "var(--muted)" }}>
        {label}
      </label>
      <div className="input-container">
        {icon && (
          <div className="input-icon-left" style={{ color: focused ? "var(--peach)" : "var(--muted)", transform: focused ? "scale(1.08)" : "scale(1)" }}>
            {icon}
          </div>
        )}
        <input
          className={`input-field ${hasValue ? "has-value" : ""} ${error ? "has-error" : ""} ${rightSlot ? "has-right" : ""}`}
          type={type}
          placeholder={placeholder}
          value={value}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => {
            setFocused(true);
            if (onFocus) onFocus(e); // 🔥 Теперь поле сообщает родителю, что по нему кликнули
          }}
          onBlur={() => setFocused(false)}
          autoComplete={autoComplete}
          style={{ paddingLeft: icon ? "44px" : "16px", paddingRight: rightSlot ? "44px" : "16px" }}
        />
        {rightSlot && <div className="input-icon-right">{rightSlot}</div>}
      </div>
      {error && (
        <span className="input-error-msg">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="var(--rose)" strokeWidth="1.2"/><path d="M6 3.5V6.5" stroke="var(--rose)" strokeWidth="1.2" strokeLinecap="round"/><circle cx="6" cy="8.5" r="0.6" fill="var(--rose)"/></svg>
          {error}
        </span>
      )}
    </div>
  );
}

// ─── PHONE INPUT FIELD (С маской и флагами) ───────────────────────────────────
// label необязателен: в модалках, где подпись рисует свой <FieldLabel>, пустой
// <label> добавлял лишний отступ. hint — строка-подсказка под полем (например
// «проверяем…», пока идёт живая проверка занятости номера).
interface PhoneFieldProps {
  label?: ReactNode;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  error?: ReactNode;
  hint?: ReactNode;
}

export function PhoneField({ label, value, onChange, error, hint }: PhoneFieldProps) {
  const [focused, setFocused] = useState(false);
  const hasValue = value && value.length > 0;

  return (
    <div className="input-wrapper">
      {label && (
        <label className="input-label" style={{ color: focused ? "var(--onyx)" : "var(--muted)" }}>
          {label}
        </label>
      )}
      <div className="input-container">
        <PhoneInput
          placeholder="+"
          value={value}
          onChange={onChange}
          className={`phone-input-wrapper ${focused ? "focused" : ""} ${hasValue ? "has-value" : ""} ${error ? "has-error" : ""}`}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </div>
      {error && (
        <span className="input-error-msg">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="var(--rose)" strokeWidth="1.2"/><path d="M6 3.5V6.5" stroke="var(--rose)" strokeWidth="1.2" strokeLinecap="round"/><circle cx="6" cy="8.5" r="0.6" fill="var(--rose)"/></svg>
          {error}
        </span>
      )}
      {!error && hint && (
        <span className="input-error-msg" style={{ color: "var(--muted)" }}>{hint}</span>
      )}
    </div>
  );
}

export function getStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: "", color: "transparent" };
  
  let score = 0;
  
  // 1. Оцениваем длину
  if (pw.length > 0) score += 1;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  
  // 2. Оцениваем разнообразие символов
  let variety = 0;
  if (/[a-zа-я]/i.test(pw)) variety++; // Буквы
  if (/[A-ZА-Я]/.test(pw) && /[a-zа-я]/.test(pw)) variety++; // И большие, и маленькие
  if (/[0-9]/.test(pw)) variety++; // Цифры
  if (/[^A-Za-zА-Яа-я0-9]/.test(pw)) variety++; // Спецсимволы (!@#$)
  
  if (variety === 3) score += 1;
  if (variety === 4) score += 2;
  
  // 3. ШТРАФЫ за популярные глупости
  if (/(.)\1{2,}/.test(pw)) score -= 1; // Штраф за "aaa", "111"
  if (/(123|234|345|456|567|678|789|890|098|987|876|765|654|543|432|321)/.test(pw)) score -= 2; // Штраф за цифры по порядку
  if (/(qwe|wer|ert|asd|sdf|zxc)/i.test(pw)) score -= 1; // Штраф за "йцукен/qwerty"
  if (/^[0-9]+$/.test(pw)) score = 1; // Если только цифры — строго слабый
  if (/^[a-zA-Z]+$/.test(pw)) Math.min(score, 2); // Если только буквы — не выше среднего

  // Загоняем результат в рамки от 1 до 4
  score = Math.max(1, Math.min(score, 4));

  const map = [
    { label: "", color: "transparent" },
    { label: "Очень слабый", color: "#D88C9A" }, // score 1
    { label: "Слабый", color: "#F9C08B" },       // score 2
    { label: "Хороший", color: "#A3C9A8" },      // score 3
    { label: "Надёжный", color: "#5DB27F" },     // score 4
  ];
  
  return { score, ...map[score] };
}

export function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="step-dots">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="step-dot" style={{
          width: i === current ? 20 : 7,
          background: i === current ? "var(--peach)" : "rgba(var(--ink),0.10)",
          boxShadow: i === current ? "0 2px 8px var(--peach-glow)" : "none",
        }} />
      ))}
    </div>
  );
}

// ─── IDENTIFIER TABS ──────────────────────────────────────────────────────────
export type IdentifierMode = "email" | "phone";
export function IdentifierTabs({ active, onChange }: { active: IdentifierMode; onChange: (m: IdentifierMode) => void }) {
  // Оставили только Email и Телефон
  const tabs: { key: IdentifierMode; label: string }[] = [
    { key: "email", label: "Email" }, 
    { key: "phone", label: "Телефон" }
  ];
  return (
    <div style={{ display: "flex", background: "rgba(var(--ink),0.04)", borderRadius: "10px", padding: "3px", gap: "2px" }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{ flex: 1, padding: "8px 12px", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: active === t.key ? 700 : 500, color: active === t.key ? "var(--onyx)" : "var(--muted)", background: active === t.key ? "var(--bg-card)" : "transparent", boxShadow: active === t.key ? "0 1px 6px rgba(26,26,26,0.08)" : "none", cursor: "pointer", transition: "all 0.2s ease" }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── BUTTONS & DIVIDERS ───────────────────────────────────────────────────────
export function GoogleBtn({ onClick }: { onClick: () => void }) {
  return (
    <button className="btn btn-google" onClick={onClick}>
      <GoogleIcon style={{ marginRight: "8px", verticalAlign: "middle" }} /> Войти через Google
    </button>
  );
}

export function PrimaryBtn({ children, onClick, loading = false, fullWidth = false, disabled = false }: {
  children: ReactNode;
  onClick?: () => void;
  loading?: boolean;
  fullWidth?: boolean;
  // Действие недоступно, пока не выполнено условие (например, не принята оферта).
  // Отличается от loading: там кнопка занята, здесь — просто нельзя.
  disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={loading || disabled} className="btn btn-primary" style={{ width: fullWidth ? "100%" : "auto", padding: "15px 28px", borderRadius: "12px", opacity: disabled && !loading ? 0.5 : undefined }}>
      {loading ? <><span className="spinner" /> Входим...</> : children}
    </button>
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "4px 0" }}>
      <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
      <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(102,102,102,0.7)", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
    </div>
  );
}

// ─── CHECKBOX ─────────────────────────────────────────────────────────────────
export function Checkbox({ checked, onChange, label }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
}) {
  return (
    <label className="checkbox-label">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <div className="checkbox-box">
        {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </div>
      <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--muted)" }}>{label}</span>
    </label>
  );
}

// ─── EXTRA UI (Social Proof & Password Strength) ──────────────────────────────
// Общий набор иконок ниш для avatar-рядов лендинга/входа/регистрации —
// один и тот же ряд использует и SocialProof (тут), и герой лендинга.
export const CATEGORY_ICONS = [Droplet, Comb, Dumbbell, Sparkle, Scissors];

export function SocialProof() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", justifyContent: "center" }}>
      <div style={{ display: "flex" }}>
        {CATEGORY_ICONS.map((IconComp, i) => (
          <div key={i} style={{ width: "26px", height: "26px", borderRadius: "50%", background: `linear-gradient(135deg, rgba(252,174,145,0.8), rgba(249,160,139,0.8))`, border: "1.5px solid white", marginLeft: i > 0 ? "-6px" : "0", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.08)" }}>
            <IconComp width={12} height={12} style={{ color: "#fff" }} />
          </div>
        ))}
      </div>
      <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0 }}><strong style={{ color: "var(--onyx)", fontWeight: 700 }}>2 400+</strong> бизнесов уже в системе</p>
      <div style={{ display: "flex", alignItems: "center", gap: "3px", padding: "3px 8px", background: "rgba(163,201,168,0.12)", borderRadius: "100px", border: "1px solid rgba(163,201,168,0.28)" }}>
        <span style={{ color: "var(--pistachio)", fontSize: "10px" }}>★</span>
        <span style={{ fontWeight: 700, fontSize: "11px", color: "var(--onyx)" }}>4.9</span>
      </div>
    </div>
  );
}

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const strength = (() => { let s = 0; if (password.length >= 8) s++; if (password.length >= 12) s++; if (/[A-Z]/.test(password)) s++; if (/[0-9]/.test(password)) s++; if (/[^A-Za-z0-9]/.test(password)) s++; return s; })();
  const levels = [{ label: "Слабый", color: "var(--rose)" }, { label: "Слабый", color: "var(--rose)" }, { label: "Средний", color: "#F9C08B" }, { label: "Хороший", color: "var(--pistachio)" }, { label: "Сильный", color: "#6DB87A" }, { label: "Отличный", color: "#4CAF62" }];
  const level = levels[Math.min(strength, 5)];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", gap: "4px" }}>
        {[1, 2, 3, 4, 5].map((i) => <div key={i} style={{ flex: 1, height: "3px", borderRadius: "2px", background: i <= strength ? level.color : "rgba(var(--ink),0.08)", transition: "background 0.3s ease" }} />)}
      </div>
      <p style={{ fontSize: "11px", fontWeight: 600, color: level.color, margin: 0, transition: "color 0.3s ease" }}>{level.label}</p>
    </div>
  );
}

export function Badge({ children }: { children: string }) {
  return (
    <span className="badge">
      <span className="badge-dot" />
      {children}
    </span>
  );
}

export function StatCard({ value, label, icon }: { value: string; label: string; icon: ReactNode }) {
  const [vis, setVis] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true); }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={`card-animate stat-card ${vis ? 'is-visible' : ''}`}>
      <div style={{ fontSize: "22px", marginBottom: "8px" }}>{icon}</div>
      <div style={{ fontWeight: 800, fontSize: "36px", color: "var(--onyx)", letterSpacing: "-1px" }}>{value}</div>
      <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--muted)", marginTop: "4px" }}>{label}</div>
    </div>
  );
}

export function FeatureCard({ icon, title, desc, delay = 0 }: { icon: ReactNode; title: string; desc: string; delay?: number }) {
  const [vis, setVis] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true); }, { threshold: 0.2 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={`card-animate feature-card ${vis ? 'is-visible' : ''}`} style={{ transitionDelay: `${delay}ms` }}>
      <div className="feature-icon-wrapper">{icon}</div>
      <h3 style={{ fontWeight: 700, fontSize: "17px", color: "var(--onyx)", margin: "0 0 10px", letterSpacing: "-0.3px" }}>{title}</h3>
      <p style={{ fontSize: "14px", lineHeight: "1.65", color: "var(--muted)", margin: 0 }}>{desc}</p>
    </div>
  );
}

export function TestimonialCard({ quote, name, role, avatar, delay = 0 }: { quote: string; name: string; role: string; avatar: ReactNode; delay?: number }) {
  const [vis, setVis] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVis(true); }, { threshold: 0.2 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={`card-animate testimonial-card ${vis ? 'is-visible' : ''}`} style={{ transitionDelay: `${delay}ms` }}>
      <div style={{ display: "flex", gap: "3px", marginBottom: "16px" }}>
        {[...Array(5)].map((_, i) => <span key={i} style={{ color: "var(--peach)", fontSize: "14px" }}>★</span>)}
      </div>
      <p style={{ fontSize: "15px", lineHeight: "1.7", color: "var(--text2)", margin: "0 0 24px", fontStyle: "italic" }}>"{quote}"</p>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: `linear-gradient(135deg, var(--peach-light), var(--peach))`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}>{avatar}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--onyx)" }}>{name}</div>
          <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>{role}</div>
        </div>
      </div>
    </div>
  );
}

// ─── ICONS ────────────────────────────────────────────────────────────────────
export const IconEmail = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="3.5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" /><path d="M1.5 5.5L8 9.5L14.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
export const IconPhone = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="4" y="1.5" width="8" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" /><circle cx="8" cy="12.5" r="0.75" fill="currentColor" /><path d="M6.5 3.5H9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
export const IconUser = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.4" /><path d="M2 13.5C2 11.0147 4.68629 9 8 9C11.3137 9 14 11.0147 14 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
export const IconLock = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.4" /><path d="M5.5 7V5C5.5 3.61929 6.61929 2.5 8 2.5C9.38071 2.5 10.5 3.61929 10.5 5V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="8" cy="10.5" r="1" fill="currentColor" /></svg>;
export const IconEyeOpen = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8C2 8 4 3 8 3C12 3 14 8 14 8C14 8 12 13 8 13C4 13 2 8 2 8Z" stroke="currentColor" strokeWidth="1.4" /><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" /><path d="M2 2L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
export const IconEyeClosed = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8C2 8 4 3 8 3C12 3 14 8 14 8C14 8 12 13 8 13C4 13 2 8 2 8Z" stroke="currentColor" strokeWidth="1.4" /><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" /></svg>;

// ─── ERROR ALERT (Красивый блок ошибки) ───────────────────────────────────────
export function ErrorAlert({ message }: { message?: string }) {
  if (!message) return null;
  
  return (
    <div className="alert-error">
      {/* Изящная кастомная иконка вместо обычного эмодзи */}
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7.5" fill="rgba(216,140,154,0.15)" stroke="var(--rose)" strokeWidth="1.2"/>
        <path d="M9 5.5V9.5" stroke="var(--rose)" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="9" cy="12.5" r="1" fill="var(--rose)"/>
      </svg>
      <span>{message}</span>
    </div>
  );
}

export const ACTIVITY_TYPES = [
  {
    id: "yoga",
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <circle cx="18" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.7"/>
        <path d="M18 10.5 L18 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M18 15 L11 21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M18 15 L25 21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M7 30 C10 23 15 22 18 22 C21 22 26 23 29 30" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M5 31.5 Q18 35 31 31.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45"/>
      </svg>
    ),
  },
  {
    id: "pilates",
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <circle cx="5.5" cy="20" r="3.5" stroke="currentColor" strokeWidth="1.7"/>
        <path d="M9 20 L22 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M22 20 L22 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M19 10 L25 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M13 20 L13 27" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M10 27 L16 27" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M3 26 L33 26" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.35"/>
      </svg>
    ),
  },
  {
    id: "stretching",
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <circle cx="14" cy="8" r="3" stroke="currentColor" strokeWidth="1.7"/>
        <path d="M14 11 L18 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M18 18 L28 22" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M18 18 L12 26" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M14 12 L8 17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M15 12 L23 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M5 31.5 Q18 35 31 31.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45"/>
      </svg>
    ),
  },
  {
    id: "bodybar",
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <circle cx="18" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.7"/>
        <path d="M18 10.5 L18 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M18 15 L11 21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M18 15 L25 21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M9 11 L27 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M18 11 L18 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <circle cx="9" cy="11" r="1.6" stroke="currentColor" strokeWidth="1.5"/>
        <circle cx="27" cy="11" r="1.6" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M5 31.5 Q18 35 31 31.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45"/>
      </svg>
    ),
  },
  {
    id: "fitness",
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <rect x="8" y="13" width="5" height="10" rx="2" stroke="currentColor" strokeWidth="1.7"/>
        <rect x="23" y="13" width="5" height="10" rx="2" stroke="currentColor" strokeWidth="1.7"/>
        <path d="M13 18 L23 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
        <path d="M5 31.5 Q18 35 31 31.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45"/>
      </svg>
    ),
  },
  {
    id: "crossfit",
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <path d="M14 11 Q18 5 22 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M14 11 L14 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M22 11 L22 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M12 24 C12 17 14 14 18 14 C22 14 24 17 24 24 C24 28 21 30 18 30 C15 30 12 28 12 24 Z" stroke="currentColor" strokeWidth="1.7"/>
        <path d="M5 31.5 Q18 35 31 31.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45"/>
      </svg>
    ),
  },
  {
    id: "dance",
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <circle cx="18" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.7"/>
        <path d="M18 10.5 L18 19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M18 19 L11 28" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M18 19 L27 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M18 13 L11 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M18 13 L27 17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M5 31.5 Q18 35 31 31.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45"/>
      </svg>
    ),
  },
  {
    id: "martial_arts",
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <path d="M12 24 C9 24 8 20 9 16 C10 12 14 10 18 10 C23 10 26 13 26 18 C26 22 23 25 19 25 L14 25 C13 25 12 24.6 12 24 Z" stroke="currentColor" strokeWidth="1.7"/>
        <path d="M12 25 L12 29 Q18 31 24 29 L24 25" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M13 16 L13 21 M18 15 L18 21 M23 16 L23 21" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.5"/>
      </svg>
    ),
  },
  {
    id: "swimming",
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <circle cx="12" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.7"/>
        <path d="M12 13 L20 18 L28 13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4 24 Q8 20 12 24 T20 24 T28 24 T36 24" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M4 30 Q8 26 12 30 T20 30 T28 30 T36 30" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45"/>
      </svg>
    ),
  },
  {
    id: "massage_spa",
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <ellipse cx="18" cy="27" rx="9" ry="3" stroke="currentColor" strokeWidth="1.7"/>
        <ellipse cx="18" cy="20.5" rx="6.5" ry="2.5" stroke="currentColor" strokeWidth="1.7"/>
        <ellipse cx="18" cy="15" rx="4.5" ry="2.1" stroke="currentColor" strokeWidth="1.7"/>
        <path d="M17 9 Q19 7 17 5 Q15 3 17 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
      </svg>
    ),
  },
  {
    id: "beauty",
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <circle cx="10" cy="9" r="3" stroke="currentColor" strokeWidth="1.7"/>
        <circle cx="10" cy="27" r="3" stroke="currentColor" strokeWidth="1.7"/>
        <path d="M12.3 11 L28 27" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M12.3 25 L28 9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: "meditation",
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <circle cx="18" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7"/>
        <path d="M18 11.2 L18 17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M18 17 Q10 17 8 22" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M18 17 Q26 17 28 22" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M18 13.5 Q12 15.5 10 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M18 13.5 Q24 15.5 26 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M5 31.5 Q18 35 31 31.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.45"/>
      </svg>
    ),
  },
  {
    id: "other",
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <path d="M18 5 L20.5 15.5 L31 18 L20.5 20.5 L18 31 L15.5 20.5 L5 18 L15.5 15.5 Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export const WEEK_START_OPTIONS = [
  { value: "monday" },
  { value: "sunday" },
];

export const BUSINESS_CATEGORIES = [
  { id: "fitness", icon: "🏋️", label: "Фитнес и спорт", subtypes: ["Тренажёрный зал", "CrossFit", "Бокс / MMA", "Йога", "Пилатес", "Стретчинг", "Танцы", "Плавание / бассейн", "Теннис", "Гольф"] },
  { id: "beauty", icon: "💆", label: "Красота и уход", subtypes: ["Салон красоты", "Барбершоп", "Nail-студия", "Татуировки / пирсинг", "Брови и ресницы", "SPA-студия", "Массаж", "Эпиляция / шугаринг"] },
  { id: "medical", icon: "🏥", label: "Медицина", subtypes: ["Клиника", "Стоматология", "Психотерапия", "Физиотерапия", "Косметология", "Дерматология", "Диетология", "Офтальмология"] },
  { id: "education", icon: "📚", label: "Образование", subtypes: ["Языковая школа", "Репетиторство", "Детский центр", "Музыкальная школа", "Онлайн-курсы", "Бизнес-коучинг", "Арт-студия", "IT-обучение"] },
  { id: "pets", icon: "🐾", label: "Ветеринария и животные", subtypes: ["Ветклиника", "Груминг", "Зоогостиница", "Кинология / дрессировка", "Зоосалон"] },
  { id: "auto", icon: "🚗", label: "Авто", subtypes: ["Автомойка", "СТО", "Детейлинг", "Шиномонтаж", "Автошкола"] },
  { id: "other", icon: "✦", label: "Другое", subtypes: ["Фотостудия", "Коворкинг", "Квест-комната", "Бьюти-бокс", "Иное"] },
];

// Все целые офсеты, по порядку и без дыр: начинаем с UTC+3 (домашний пояс) и
// идём на восток — +4 … +14, за линией перемены дат -11 … -1, и обратно к дому
// через 0, +1, +2. Список значений обязан совпадать с Literal Timezone в
// back/schemas/settings/general.py, подписи — ключи onboarding:settings.timezones.
// Получасовых поясов (+5:30) нет намеренно: офсет парсится как int часов
// (services/daily_notify.py:_studio_tz).
export const TIMEZONES = [
  { value: "UTC+3" }, { value: "UTC+4" }, { value: "UTC+5" }, { value: "UTC+6" },
  { value: "UTC+7" }, { value: "UTC+8" }, { value: "UTC+9" }, { value: "UTC+10" },
  { value: "UTC+11" }, { value: "UTC+12" }, { value: "UTC+13" }, { value: "UTC+14" },
  { value: "UTC-11" }, { value: "UTC-10" }, { value: "UTC-9" }, { value: "UTC-8" },
  { value: "UTC-7" }, { value: "UTC-6" }, { value: "UTC-5" }, { value: "UTC-4" },
  { value: "UTC-3" }, { value: "UTC-2" }, { value: "UTC-1" },
  { value: "UTC+0" }, { value: "UTC+1" }, { value: "UTC+2" },
];

// Стартовый пояс = пояс браузера: человеку остаётся согласиться, а не искать свой.
// Дробные пояса (+5:30) обрезаем до целого — в списке только целые.
export const browserTimezone = (): string => {
  const hours = Math.trunc(-new Date().getTimezoneOffset() / 60);
  const value = `UTC${hours >= 0 ? "+" : ""}${hours}`;
  return TIMEZONES.some(tz => tz.value === value) ? value : "UTC+0";
};

// Языки интерфейса. Список намеренно сокращён до пяти: продаём пока в этих
// странах, а остальные переводы лежат в locales/ машинными и не вычитаны —
// студия, выбравшая их, увидела бы кривой интерфейс. Возвращать по одному, по
// мере вычитки перевода: папка в src/locales + строка здесь.
// Список языков переехал в utils/lang.ts — его читает ещё и лендинг, которому
// весь UI.tsx не нужен. Реэкспорт оставлен, чтобы импорты по проекту не менять.
export { LANGUAGES } from "../utils/lang";

// Таблица символов — полная и такой остаётся: getCurrencySymbol() рисует
// деньги во всём продукте, и студия, выбравшая злотый, пока список был
// длинным, не должна вдруг увидеть рубли. Выбирать же можно только из
// CURRENCY_OPTIONS ниже.
export const CURRENCIES = [
  { value: "RUB", symbol: "₽" }, { value: "USD", symbol: "$" },
  { value: "EUR", symbol: "€" }, { value: "KZT", symbol: "₸" },
  { value: "UAH", symbol: "₴" }, { value: "GBP", symbol: "£" },
  { value: "AED", symbol: "د.إ" }, { value: "TRY", symbol: "₺" },
  { value: "CZK", symbol: "Kč" }, { value: "PLN", symbol: "zł" },
  { value: "HUF", symbol: "Ft" }, { value: "RON", symbol: "lei" },
  { value: "BGN", symbol: "лв" }, { value: "SEK", symbol: "kr" },
  { value: "NOK", symbol: "kr" }, { value: "DKK", symbol: "kr" },
  { value: "CHF", symbol: "CHF" }, { value: "ISK", symbol: "kr" },
  { value: "RSD", symbol: "дин." },
];

// Что предлагаем выбрать — валюты стран, где говорят на языках из LANGUAGES:
// ₽ (ru), ₴ (uk), Kč (cs), € и CHF (de: Германия/Австрия/Швейцария),
// $ и £ (en). Расширять вместе со списком языков.
const PICKABLE = ["RUB", "USD", "EUR", "UAH", "GBP", "CZK", "CHF"];
export const CURRENCY_OPTIONS = CURRENCIES.filter(c => PICKABLE.includes(c.value));

export function getCurrencySymbol(code: string | undefined): string {
  return CURRENCIES.find(c => c.value === code)?.symbol ?? "₽";
}

export function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      {Array.from({ length: total }, (_, i) => {
        const step = i + 1;
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

export function PremiumSelect({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; symbol?: string; flag?: string }[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Рендерим список в портал с position:fixed — иначе его обрезают overflow:hidden
  // родители (например .ob-left/.ob-right-scroll в онбординге), см. Tooltip/InfoHint.
  // Ширину/лево берём из rect кнопки напрямую (не из измерения самого портала —
  // тот меряется на кадр позже и на первом open даёт 0, из-за чего список съезжал влево).
  const [placement, setPlacement] = useState<{ top: number; left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const recalc = () => {
      if (!btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      const { top, left } = placePopover(rect, { w: rect.width, h: 200 }, "bottom", 6);
      setPlacement({ top, left, width: rect.width });
    };
    recalc();
    window.addEventListener("resize", recalc);
    window.addEventListener("scroll", recalc, true);
    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("scroll", recalc, true);
    };
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", padding: "13px 16px", background: "var(--bg-card)",
          border: open ? "1.5px solid #FCAE91" : "1.5px solid #EEEBE6",
          borderRadius: "12px", fontSize: "15px", color: selected ? "var(--onyx)" : "#AAAAAA",
          textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "space-between", transition: "all 0.2s ease",
          boxShadow: open ? "0 0 0 4px rgba(252,174,145,0.12)" : "none",
          outline: "none", fontFamily: "inherit", minWidth: 0,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, overflow: "hidden" }}>
          {selected?.flag && <span style={{ flexShrink: 0 }}>{selected.flag}</span>}
          {selected?.symbol && (
            <span style={{
              width: "22px", height: "22px", background: "rgba(252,174,145,0.15)", borderRadius: "6px",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, color: "#FCAE91",
              flexShrink: 0,
            }}>{selected.symbol}</span>
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected?.label || placeholder}</span>
        </span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease", flexShrink: 0 }}>
          <path d="M4 6L8 10L12 6" stroke="#AAAAAA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && createPortal(
        <div ref={listRef} style={{
          position: "fixed",
          top: placement ? `${placement.top}px` : 0,
          left: placement ? `${placement.left}px` : 0,
          width: placement ? `${placement.width}px` : undefined,
          visibility: placement ? "visible" : "hidden",
          background: "#1E1E1E", border: "1.5px solid rgba(255,255,255,0.08)", borderRadius: "14px",
          zIndex: 1200, maxHeight: "200px", overflowY: "auto",
          boxShadow: "0 16px 48px rgba(0,0,0,0.4)", animation: "dropDown 0.15s cubic-bezier(0.34,1.1,0.64,1)",
        }}>
          {options.map((opt) => (
            <button
              key={opt.value} type="button" onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                width: "100%", padding: "10px 14px",
                background: opt.value === value ? "rgba(252,174,145,0.15)" : "transparent",
                border: "none", textAlign: "left", cursor: "pointer", fontSize: "14px",
                color: opt.value === value ? "#FCAE91" : "rgba(255,255,255,0.85)",
                display: "flex", alignItems: "center", gap: "8px", fontFamily: "inherit", transition: "background 0.15s ease",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = opt.value === value ? "rgba(252,174,145,0.22)" : "rgba(255,255,255,0.06)")}
              onMouseLeave={e => (e.currentTarget.style.background = opt.value === value ? "rgba(252,174,145,0.15)" : "transparent")}
            >
              {opt.flag && <span>{opt.flag}</span>}
              {opt.symbol && (
                <span style={{
                  width: "22px", height: "22px",
                  background: opt.value === value ? "rgba(252,174,145,0.2)" : "rgba(255,255,255,0.08)",
                  borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "11px", fontWeight: 700, color: opt.value === value ? "#FCAE91" : "rgba(255,255,255,0.5)",
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
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── ONBOARDING ILLUSTRATIONS (Live, reactive) ────────────────────────────────

export function Illustration1({ studioName, logoPreviewUrl }: { studioName: string; logoPreviewUrl: string }) {
  const { t } = useTranslation("onboarding");
  const initial = studioName.trim().charAt(0).toUpperCase() || '';
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      <div style={{
        width: '200px', background: 'var(--bg-card)', borderRadius: '18px',
        boxShadow: '0 20px 50px rgba(26,26,26,0.10), 0 4px 12px rgba(26,26,26,0.06)',
        border: '1px solid #F0EDE8', overflow: 'hidden',
        animation: 'floatLogin1 5s ease-in-out infinite',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #F5F3F0', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
            background: logoPreviewUrl ? 'transparent' : 'linear-gradient(135deg, #FCAE91, #F9A08B)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', fontSize: '15px', fontWeight: 900, color: 'white',
          }}>
            {logoPreviewUrl
              ? <img src={logoPreviewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : initial || <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="1.5" fill="white" opacity="0.9"/><rect x="9" y="2" width="5" height="5" rx="1.5" fill="white" opacity="0.5"/><rect x="2" y="9" width="5" height="5" rx="1.5" fill="white" opacity="0.5"/><rect x="9" y="9" width="5" height="5" rx="1.5" fill="white" opacity="0.9"/></svg>
            }
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontWeight: 800, fontSize: '12px', color: studioName ? 'var(--onyx)' : '#AAAAAA', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {studioName || t("onboarding:illustration.studioNamePlaceholder")}
            </div>
            <div style={{ fontSize: '10px', color: '#AAAAAA', marginTop: '1px' }}>Velora CRM</div>
          </div>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#A3C9A8', animation: 'stepPulse 2s infinite' }} />
        </div>
        <div style={{ padding: '12px 16px 10px' }}>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            {[{ v: '248', l: t("onboarding:illustration.clients"), c: '#FCAE91' }, { v: '94%', l: t("onboarding:illustration.attendance"), c: '#A3C9A8' }].map((s, i) => (
              <div key={i} style={{ flex: 1, padding: '8px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid #F0EDE8' }}>
                <div style={{ fontWeight: 800, fontSize: '14px', color: s.c }}>{s.v}</div>
                <div style={{ fontSize: '9px', color: '#AAAAAA', marginTop: '1px' }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '28px' }}>
            {[35, 60, 45, 80, 55, 90, 65].map((h, i) => (
              <div key={i} style={{ flex: 1, borderRadius: '3px 3px 2px 2px', height: `${h * 0.28}px`, background: i === 5 ? 'linear-gradient(180deg, #FCAE91, #F9A08B)' : `rgba(252,174,145,${0.1 + i * 0.04})` }} />
            ))}
          </div>
        </div>
      </div>
      {studioName.trim().length > 0 && (
        <div style={{ padding: '5px 12px', background: 'rgba(163,201,168,0.15)', borderRadius: '100px', border: '1px solid rgba(163,201,168,0.3)', fontSize: '11px', fontWeight: 700, color: '#5A8A60', animation: 'slideInRight 0.3s ease', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#A3C9A8' }} />
          {t("onboarding:illustration.studioCreated")}
        </div>
      )}
    </div>
  );
}

export function Illustration2({ activityType }: { activityType: string }) {
  const { t } = useTranslation("onboarding");
  if (activityType === 'yoga') {
    return (
      <svg viewBox="0 0 280 220" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxHeight: '190px' }}>
        <ellipse cx="140" cy="110" rx="90" ry="70" fill="rgba(252,174,145,0.07)"/>
        <circle cx="140" cy="110" r="68" stroke="#FCAE91" strokeWidth="1" strokeDasharray="4 8" opacity="0.2">
          <animateTransform attributeName="transform" type="rotate" values="0 140 110;360 140 110" dur="16s" repeatCount="indefinite"/>
        </circle>
        <circle cx="140" cy="110" r="94" stroke="#A3C9A8" strokeWidth="1" strokeDasharray="3 12" opacity="0.12">
          <animateTransform attributeName="transform" type="rotate" values="360 140 110;0 140 110" dur="28s" repeatCount="indefinite"/>
        </circle>
        <line x1="140" y1="150" x2="126" y2="176" stroke="#FCAE91" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="140" y1="150" x2="154" y2="176" stroke="#FCAE91" strokeWidth="2.5" strokeLinecap="round"/>
        <g>
          <animateTransform attributeName="transform" type="rotate" values="0 140 150;50 140 150;50 140 150;0 140 150" keyTimes="0;0.4;0.6;1" dur="3.6s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0 0 0 0;0.45 0 0.55 1"/>
          <path d="M140 150 L140 122" stroke="#FCAE91" strokeWidth="2.5" strokeLinecap="round"/>
          <circle cx="140" cy="110" r="13" fill="white" stroke="#F0EDE8" strokeWidth="1.5"/>
          <circle cx="140" cy="110" r="7" fill="#FDFCFB"/>
          <path d="M140 128 L124 104" stroke="#FCAE91" strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M140 128 L156 104" stroke="#FCAE91" strokeWidth="2.5" strokeLinecap="round"/>
        </g>
        <circle cx="198" cy="56" r="4" fill="#FCAE91" opacity="0.35"><animateTransform attributeName="transform" type="translate" values="0,0;4,-5;0,0" dur="3s" repeatCount="indefinite" additive="sum"/></circle>
        <circle cx="82" cy="82" r="3" fill="#A3C9A8" opacity="0.4"><animateTransform attributeName="transform" type="translate" values="0,0;-3,4;0,0" dur="4.5s" repeatCount="indefinite" additive="sum"/></circle>
        <circle cx="210" cy="148" r="5" fill="#FCAE91" opacity="0.2"><animateTransform attributeName="transform" type="translate" values="0,0;5,4;0,0" dur="5s" repeatCount="indefinite" additive="sum"/></circle>
        <text x="140" y="196" textAnchor="middle" fontSize="11" fill="#AAAAAA" fontWeight="600" fontFamily="inherit">{t("onboarding:activity.types.yoga.label")}</text>
      </svg>
    );
  }
  if (activityType === 'pilates') {
    return (
      <svg viewBox="0 0 280 220" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxHeight: '190px' }}>
        <ellipse cx="140" cy="118" rx="100" ry="60" fill="rgba(163,201,168,0.08)"/>
        <circle cx="140" cy="110" r="88" stroke="#A3C9A8" strokeWidth="0.8" strokeDasharray="3 14" opacity="0.18">
          <animateTransform attributeName="transform" type="rotate" values="0 140 110;360 140 110" dur="32s" repeatCount="indefinite"/>
        </circle>
        <rect x="70" y="152" width="140" height="8" rx="4" fill="#F0EDE8"/>
        <circle cx="88" cy="140" r="11" fill="white" stroke="#F0EDE8" strokeWidth="1.5"/>
        <circle cx="88" cy="140" r="6" fill="#FDFCFB"/>
        <path d="M99 140 L150 150" stroke="#FCAE91" strokeWidth="3" strokeLinecap="round"/>
        <path d="M110 143 L132 148" stroke="#FCAE91" strokeWidth="2" strokeLinecap="round"/>
        <g>
          <animateTransform attributeName="transform" type="rotate" values="-8 150 150;-58 150 150;-58 150 150;-8 150 150" keyTimes="0;0.4;0.6;1" dur="2.6s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0 0 0 0;0.45 0 0.55 1"/>
          <line x1="150" y1="150" x2="204" y2="150" stroke="#FCAE91" strokeWidth="4" strokeLinecap="round"/>
        </g>
        <circle cx="68" cy="74" r="3.5" fill="#FCAE91" opacity="0.3"><animateTransform attributeName="transform" type="translate" values="0,0;-3,-5;0,0" dur="4s" repeatCount="indefinite" additive="sum"/></circle>
        <circle cx="216" cy="90" r="5" fill="#A3C9A8" opacity="0.25"><animateTransform attributeName="transform" type="translate" values="0,0;4,4;0,0" dur="5s" repeatCount="indefinite" additive="sum"/></circle>
        <text x="140" y="196" textAnchor="middle" fontSize="11" fill="#AAAAAA" fontWeight="600" fontFamily="inherit">{t("onboarding:activity.types.pilates.label")}</text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 280 220" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', maxHeight: '190px' }}>
      <circle cx="140" cy="108" r="60" stroke="#FCAE91" strokeWidth="1" strokeDasharray="4 8" opacity="0.2"><animateTransform attributeName="transform" type="rotate" values="0 140 108;360 140 108" dur="20s" repeatCount="indefinite"/></circle>
      <circle cx="140" cy="108" r="42" stroke="#FCAE91" strokeWidth="1.2" strokeDasharray="3 6" opacity="0.15"><animateTransform attributeName="transform" type="rotate" values="360 140 108;0 140 108" dur="14s" repeatCount="indefinite"/></circle>
      <circle cx="140" cy="108" r="26" fill="rgba(252,174,145,0.06)" stroke="#FCAE91" strokeWidth="1" opacity="0.3">
        <animate attributeName="r" values="26;30;26" dur="3s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.3;0.5;0.3" dur="3s" repeatCount="indefinite"/>
      </circle>
      <text x="140" y="116" textAnchor="middle" fontSize="22" fill="#FCAE91" opacity="0.35">?</text>
      <text x="140" y="185" textAnchor="middle" fontSize="11" fill="#CCCCCC" fontWeight="500" fontFamily="inherit">{t("onboarding:illustration.chooseDirection")}</text>
    </svg>
  );
}

export function Illustration3({ phone, email, address }: { phone: string; email: string; address: string }) {
  const { t } = useTranslation("onboarding");
  const hasPhone = !!phone && phone.length > 5;
  const hasEmail = !!email && email.includes('@');
  const hasAddress = !!address && address.length > 2;
  return (
    <div style={{ width: '100%', height: '200px', position: 'relative' }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '52px', height: '52px', borderRadius: '50%', background: 'linear-gradient(135deg, rgba(252,174,145,0.12), rgba(163,201,168,0.08))', border: '1.5px solid rgba(252,174,145,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2 C6.5 2 4 4.8 4 8 C4 12.8 10 18 10 18 C10 18 16 12.8 16 8 C16 4.8 13.5 2 10 2 Z" fill="#FCAE91" opacity="0.7"/><circle cx="10" cy="8" r="3" fill="white"/></svg>
      </div>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox="0 0 280 200" preserveAspectRatio="none">
        <line x1="140" y1="100" x2="70" y2="48" stroke="#F0EDE8" strokeWidth="1" strokeDasharray="3 4"/>
        <line x1="140" y1="100" x2="210" y2="48" stroke="#F0EDE8" strokeWidth="1" strokeDasharray="3 4"/>
        <line x1="140" y1="100" x2="140" y2="162" stroke="#F0EDE8" strokeWidth="1" strokeDasharray="3 4"/>
      </svg>
      <div style={{ position: 'absolute', top: '8px', left: '8px', transition: 'all 0.4s ease', opacity: hasPhone ? 1 : 0.4, animation: 'floatLogin2 5s ease-in-out infinite' }}>
        <div style={{ background: 'var(--bg-card)', border: `1.5px solid ${hasPhone ? 'rgba(252,174,145,0.4)' : '#F0EDE8'}`, borderRadius: '12px', padding: '10px 14px', boxShadow: hasPhone ? '0 8px 24px rgba(252,174,145,0.14)' : '0 4px 12px rgba(26,26,26,0.05)', transition: 'all 0.4s ease' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, color: '#AAAAAA', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>{t("onboarding:illustration.phoneLabel")}</div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: hasPhone ? 'var(--onyx)' : '#CCCCCC', whiteSpace: 'nowrap' }}>{hasPhone ? (phone.length > 13 ? phone.slice(0, 13) : phone) : t("onboarding:illustration.phonePlaceholder")}</div>
        </div>
      </div>
      <div style={{ position: 'absolute', top: '8px', right: '8px', transition: 'all 0.4s ease', opacity: hasEmail ? 1 : 0.4, animation: 'floatLogin1 6s ease-in-out infinite' }}>
        <div style={{ background: 'var(--bg-card)', border: `1.5px solid ${hasEmail ? 'rgba(163,201,168,0.4)' : '#F0EDE8'}`, borderRadius: '12px', padding: '10px 14px', boxShadow: hasEmail ? '0 8px 24px rgba(163,201,168,0.14)' : '0 4px 12px rgba(26,26,26,0.05)', transition: 'all 0.4s ease' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, color: '#AAAAAA', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>{t("onboarding:illustration.emailLabel")}</div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: hasEmail ? 'var(--onyx)' : '#CCCCCC', whiteSpace: 'nowrap' }}>{hasEmail ? (email.length > 15 ? email.slice(0, 12) + '…' : email) : t("onboarding:illustration.emailPlaceholder")}</div>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', transition: 'all 0.4s ease', opacity: hasAddress ? 1 : 0.4, animation: 'floatLogin3 7s ease-in-out infinite' }}>
        <div style={{ background: 'var(--bg-card)', border: `1.5px solid ${hasAddress ? 'rgba(252,174,145,0.35)' : '#F0EDE8'}`, borderRadius: '12px', padding: '10px 14px', boxShadow: hasAddress ? '0 8px 24px rgba(252,174,145,0.12)' : '0 4px 12px rgba(26,26,26,0.05)', transition: 'all 0.4s ease', whiteSpace: 'nowrap' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, color: '#AAAAAA', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>{t("onboarding:illustration.addressLabel")}</div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: hasAddress ? 'var(--onyx)' : '#CCCCCC' }}>{hasAddress ? (address.length > 18 ? address.slice(0, 15) + '…' : address) : t("onboarding:illustration.addressPlaceholder")}</div>
        </div>
      </div>
    </div>
  );
}

export function Illustration4({ timezone, currency, language }: { timezone: string; currency: string; language: string }) {
  const { t } = useTranslation("onboarding");
  const curr = CURRENCIES.find(c => c.value === currency);
  const lang = LANGUAGES.find(l => l.value === language);
  const tz = TIMEZONES.find(tz => tz.value === timezone);
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '4px 0' }}>
      <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--bg-card)', border: '2px solid #F0EDE8', boxShadow: '0 8px 24px rgba(26,26,26,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', animation: 'floatLogin1 5s ease-in-out infinite', flexShrink: 0 }}>
        <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
          <circle cx="21" cy="21" r="18" stroke="#F0EDE8" strokeWidth="1.5"/>
          <path d="M21 9 L21 21 L30 21" stroke="#FCAE91" strokeWidth="2" strokeLinecap="round"/>
          <circle cx="21" cy="21" r="2.5" fill="#FCAE91"/>
        </svg>
        <div style={{ position: 'absolute', bottom: '-10px', right: '-10px', background: 'var(--onyx)', borderRadius: '8px', padding: '3px 7px', fontSize: '10px', fontWeight: 700, color: 'var(--bg)', whiteSpace: 'nowrap' }}>
          {timezone || 'UTC+1'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1.5px solid #F0EDE8', borderRadius: '12px', padding: '10px 16px', boxShadow: '0 4px 14px rgba(26,26,26,0.06)', textAlign: 'center', animation: 'floatLogin2 6s ease-in-out infinite' }}>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#FCAE91', lineHeight: '1' }}>{curr?.symbol || '$'}</div>
          <div style={{ fontSize: '9px', color: '#AAAAAA', fontWeight: 600, marginTop: '4px' }}>{t(`onboarding:settings.currencies.${curr?.value ?? 'USD'}`)}</div>
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1.5px solid #F0EDE8', borderRadius: '12px', padding: '10px 16px', boxShadow: '0 4px 14px rgba(26,26,26,0.06)', textAlign: 'center', animation: 'floatLogin3 7s ease-in-out infinite' }}>
          <div style={{ fontSize: '20px', lineHeight: '1' }}>{lang?.flag || '🇬🇧'}</div>
          <div style={{ fontSize: '9px', color: '#AAAAAA', fontWeight: 600, marginTop: '4px' }}>{(lang?.label ?? 'English').slice(0, 8)}</div>
        </div>
      </div>
      {tz && <div style={{ fontSize: '11px', color: '#AAAAAA', fontWeight: 500 }}>{t(`onboarding:settings.timezones.${tz.value}`)}</div>}
    </div>
  );
}

const DOW_TO_DAY_KEY = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function Illustration5({ workingHours }: { workingHours: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }> }) {
  const { t } = useTranslation(["onboarding", "common"]);
  return (
    <div style={{ width: '100%', padding: '0 4px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
      {workingHours.map((day, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.3s ease' }}>
          <span style={{ width: '22px', fontSize: '10px', fontWeight: 700, color: day.isOpen ? 'var(--onyx)' : '#CCCCCC', flexShrink: 0, transition: 'color 0.3s ease' }}>
            {t(`common:days.short.${DOW_TO_DAY_KEY[idx]}`)}
          </span>
          <div style={{ flex: 1, height: '20px', borderRadius: '6px', background: day.isOpen ? 'linear-gradient(90deg, rgba(252,174,145,0.28), rgba(252,174,145,0.12))' : 'rgba(var(--ink),0.04)', transition: 'all 0.35s cubic-bezier(0.34,1.1,0.64,1)', display: 'flex', alignItems: 'center', paddingLeft: '8px' }}>
            {day.isOpen
              ? <span style={{ fontSize: '9px', fontWeight: 600, color: '#F9A08B', whiteSpace: 'nowrap' }}>{day.openTime} – {day.closeTime}</span>
              : <span style={{ fontSize: '9px', color: '#CCCCCC', fontStyle: 'italic' }}>{t("onboarding:illustration.dayOff")}</span>
            }
          </div>
          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: day.isOpen ? '#FCAE91' : '#E8E4DF', flexShrink: 0, transition: 'all 0.3s ease', boxShadow: day.isOpen ? '0 2px 6px rgba(252,174,145,0.4)' : 'none' }} />
        </div>
      ))}
    </div>
  );
}

// 1. УМНАЯ КНОПКА (Единый класс .btn)
// 1. УМНАЯ КНОПКА (Единый класс .btn)
interface ButtonProps {
  children: React.ReactNode;
  icon?: React.ElementType; // Идеальный тип для иконок-компонентов
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  style?: React.CSSProperties;
  danger?: boolean;
}

export const Button = ({ children, icon: IconComponent, onClick, className = 'btn', style, danger }: ButtonProps) => {
  return (
    <button 
      className={`${className} ${danger ? 'danger' : ''}`}
      style={{
        display: 'flex', alignItems: 'center', gap: '8px', 
        fontSize: '12px', fontWeight: 600,
        ...style
      }} 
      onClick={onClick}
    >
      {IconComponent && <IconComponent size={18} />} 
      {children}
    </button>
  );
};

// 2. УМНАЯ КНОПКА ПРИМАРНАЯ (Единый класс .btn-primary)
export const PrimaryButton = (props: ButtonProps) => {
  return <Button {...props} className="btn-primary" />;
};