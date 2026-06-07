// ─── В самом верху UI.tsx ───
import { GoogleIcon } from "./Icons"; // 🔥 Убрали неиспользуемый IconProps
import { useState, useEffect, useRef } from "react";

// @ts-ignore
import PhoneInput from 'react-phone-number-input';
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
export function InputField({ label, type = "text", placeholder, value, onChange, onFocus, icon, rightSlot, error, autoComplete, maxLength }: any) {
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
export function PhoneField({ label, value, onChange, error }: any) {
  const [focused, setFocused] = useState(false);
  const hasValue = value && value.length > 0;

  return (
    <div className="input-wrapper">
      <label className="input-label" style={{ color: focused ? "var(--onyx)" : "var(--muted)" }}>
        {label}
      </label>
      <div className="input-container">
        <PhoneInput
          international
          defaultCountry="RU" 
          value={value}
          onChange={onChange}
          limitMaxLength={true} // 🔥 Магия! Блокирует ввод лишних цифр для выбранной страны
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
          background: i === current ? "var(--peach)" : "rgba(26,26,26,0.10)",
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
    <div style={{ display: "flex", background: "rgba(26,26,26,0.04)", borderRadius: "10px", padding: "3px", gap: "2px" }}>
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

export function PrimaryBtn({ children, onClick, loading = false, fullWidth = false }: any) {
  return (
    <button onClick={onClick} disabled={loading} className="btn btn-primary" style={{ width: fullWidth ? "100%" : "auto", padding: "15px 28px", borderRadius: "12px" }}>
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
export function Checkbox({ checked, onChange, label }: any) {
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
export function SocialProof() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", justifyContent: "center" }}>
      <div style={{ display: "flex" }}>
        {["🧖", "💇", "🏋️", "💅", "✂️"].map((e, i) => (
          <div key={i} style={{ width: "26px", height: "26px", borderRadius: "50%", background: `linear-gradient(135deg, rgba(252,174,145,0.8), rgba(249,160,139,0.8))`, border: "1.5px solid white", marginLeft: i > 0 ? "-6px" : "0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", boxShadow: "0 2px 6px rgba(0,0,0,0.08)" }}>{e}</div>
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
        {[1, 2, 3, 4, 5].map((i) => <div key={i} style={{ flex: 1, height: "3px", borderRadius: "2px", background: i <= strength ? level.color : "rgba(26,26,26,0.08)", transition: "background 0.3s ease" }} />)}
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

export function StatCard({ value, label, icon }: { value: string; label: string; icon: string }) {
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

export function FeatureCard({ icon, title, desc, delay = 0 }: { icon: string; title: string; desc: string; delay?: number }) {
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

export function TestimonialCard({ quote, name, role, avatar, delay = 0 }: { quote: string; name: string; role: string; avatar: string; delay?: number }) {
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
      <p style={{ fontSize: "15px", lineHeight: "1.7", color: "#333", margin: "0 0 24px", fontStyle: "italic" }}>"{quote}"</p>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: `linear-gradient(135deg, var(--peach-light), var(--peach))`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", flexShrink: 0 }}>{avatar}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--onyx)" }}>{name}</div>
          <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>{role}</div>
        </div>
      </div>
    </div>
  );
}

export function DashboardMockup() {
  const bars = [62, 80, 45, 95, 70, 55, 88];
  return (
    <div style={{ width: "100%", background: "var(--bg-card)", borderRadius: "20px", border: `1px solid var(--border)`, boxShadow: "0 32px 80px -16px rgba(26,26,26,0.14)", overflow: "hidden" }}>
      <div style={{ padding: "14px 20px", background: "#F5F4F2", borderBottom: `1px solid var(--border)`, display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ width:"10px",height:"10px",borderRadius:"50%",background:"#FFC77D" }} />
        <div style={{ width:"10px",height:"10px",borderRadius:"50%",background:"#FFDF5D" }} />
        <div style={{ width:"10px",height:"10px",borderRadius:"50%",background:"#7DCF87" }} />
        <div style={{ flex:1, margin:"0 12px", padding:"4px 12px", background:"rgba(255,255,255,0.8)", borderRadius:"6px", border:`1px solid var(--border)`, fontSize:"11px", color:"var(--muted)", textAlign:"center" }}>app.velora.io/dashboard</div>
      </div>
      <div style={{ display:"flex", height:"380px" }}>
        <div style={{ width:"56px", background:"#F9F8F7", borderRight:`1px solid var(--border)`, display:"flex", flexDirection:"column", alignItems:"center", paddingTop:"20px", gap:"18px" }}>
          {["🏡","📅","👥","💬","📊","⚙️"].map((ico,i) => <div key={i} style={{ width:"34px",height:"34px",borderRadius:"9px", background: i===0 ? `linear-gradient(135deg, var(--peach-light), var(--peach))` : "transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"15px", cursor:"pointer" }}>{ico}</div>)}
        </div>
        <div style={{ flex:1, padding:"24px", overflowY:"auto" }}>
          <div style={{ marginBottom:"20px" }}>
            <div style={{ fontWeight:800, fontSize:"18px", color:"var(--onyx)", letterSpacing:"-0.4px" }}>Дашборд</div>
            <div style={{ fontSize:"12px", color:"var(--muted)", marginTop:"2px" }}>Понедельник, 1 июня 2026</div>
          </div>
          <div style={{ display:"flex", gap:"10px", marginBottom:"20px" }}>
            {[{ v:"248", l:"Записей", c: "var(--peach)" }, { v:"94%", l:"Заполн.", c: "var(--pistachio)" }, { v:"₽186K", l:"Выручка", c: "#7BA7D4" }].map((s,i) => (
              <div key={i} style={{ flex:1, padding:"12px 14px", background:"var(--bg-card)", borderRadius:"12px", border:`1px solid var(--border)`, boxShadow:"0 2px 8px rgba(0,0,0,0.04)" }}>
                <div style={{ fontWeight:800, fontSize:"20px", color: s.c, letterSpacing:"-0.5px" }}>{s.v}</div>
                <div style={{ fontSize:"10px", color:"var(--muted)", marginTop:"2px" }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ padding:"16px", background:"var(--bg-card)", borderRadius:"12px", border:`1px solid var(--border)` }}>
            <div style={{ fontSize:"11px", fontWeight:700, color:"var(--onyx)", marginBottom:"12px" }}>Записи на неделю</div>
            <div style={{ display:"flex", alignItems:"flex-end", gap:"6px", height:"64px" }}>
              {bars.map((h,i) => (
                <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:"4px" }}>
                  <div style={{ width:"100%", height:`${h * 0.64}px`, background: i===3 ? `linear-gradient(180deg, var(--peach-light), var(--peach))` : `rgba(249,160,139,${0.15 + i*0.03})`, borderRadius:"4px 4px 2px 2px", transition:"height 0.4s ease" }} />
                  <span style={{ fontSize:"8px", color:"var(--muted)" }}>{"ПВСЧПСВ"[i]}</span>
                </div>
              ))}
            </div>
          </div>
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

export const BUSINESS_CATEGORIES = [
  { id: "fitness", icon: "🏋️", label: "Фитнес и спорт", subtypes: ["Тренажёрный зал", "CrossFit", "Бокс / MMA", "Йога", "Пилатес", "Стретчинг", "Танцы", "Плавание / бассейн", "Теннис", "Гольф"] },
  { id: "beauty", icon: "💆", label: "Красота и уход", subtypes: ["Салон красоты", "Барбершоп", "Nail-студия", "Татуировки / пирсинг", "Брови и ресницы", "SPA-студия", "Массаж", "Эпиляция / шугаринг"] },
  { id: "medical", icon: "🏥", label: "Медицина", subtypes: ["Клиника", "Стоматология", "Психотерапия", "Физиотерапия", "Косметология", "Дерматология", "Диетология", "Офтальмология"] },
  { id: "education", icon: "📚", label: "Образование", subtypes: ["Языковая школа", "Репетиторство", "Детский центр", "Музыкальная школа", "Онлайн-курсы", "Бизнес-коучинг", "Арт-студия", "IT-обучение"] },
  { id: "pets", icon: "🐾", label: "Ветеринария и животные", subtypes: ["Ветклиника", "Груминг", "Зоогостиница", "Кинология / дрессировка", "Зоосалон"] },
  { id: "auto", icon: "🚗", label: "Авто", subtypes: ["Автомойка", "СТО", "Детейлинг", "Шиномонтаж", "Автошкола"] },
  { id: "other", icon: "✦", label: "Другое", subtypes: ["Фотостудия", "Коворкинг", "Квест-комната", "Бьюти-бокс", "Иное"] },
];

export const TIMEZONES = [
  { value: "UTC+3", label: "Москва (UTC+3)" }, { value: "UTC+2", label: "Калининград (UTC+2)" },
  { value: "UTC+4", label: "Самара (UTC+4)" }, { value: "UTC+5", label: "Екатеринбург (UTC+5)" },
  { value: "UTC+6", label: "Омск (UTC+6)" }, { value: "UTC+7", label: "Красноярск (UTC+7)" },
  { value: "UTC+8", label: "Иркутск (UTC+8)" }, { value: "UTC+9", label: "Якутск (UTC+9)" },
  { value: "UTC+10", label: "Владивосток (UTC+10)" }, { value: "UTC+11", label: "Магадан (UTC+11)" },
  { value: "UTC+12", label: "Камчатка (UTC+12)" }, { value: "UTC+1", label: "Центральная Европа (UTC+1)" },
  { value: "UTC+0", label: "Лондон (UTC+0)" }, { value: "UTC-5", label: "Нью-Йорк (UTC-5)" },
  { value: "UTC-8", label: "Лос-Анджелес (UTC-8)" },
];

export const LANGUAGES = [
  { value: "ru", label: "Русский", flag: "🇷🇺" }, { value: "en", label: "English", flag: "🇬🇧" },
  { value: "uk", label: "Українська", flag: "🇺🇦" }, { value: "kz", label: "Қазақша", flag: "🇰🇿" },
  { value: "de", label: "Deutsch", flag: "🇩🇪" }, { value: "fr", label: "Français", flag: "🇫🇷" },
  { value: "es", label: "Español", flag: "🇪🇸" }, { value: "ar", label: "العربية", flag: "🇦🇪" },
];

export const CURRENCIES = [
  { value: "RUB", label: "Рубль", symbol: "₽" }, { value: "USD", label: "Доллар", symbol: "$" },
  { value: "EUR", label: "Евро", symbol: "€" }, { value: "KZT", label: "Тенге", symbol: "₸" },
  { value: "UAH", label: "Гривна", symbol: "₴" }, { value: "GBP", label: "Фунт", symbol: "£" },
  { value: "AED", label: "Дирхам", symbol: "د.إ" }, { value: "TRY", label: "Лира", symbol: "₺" },
];

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
          width: "100%", padding: "13px 16px", background: "white",
          border: open ? "1.5px solid #FCAE91" : "1.5px solid #EEEBE6",
          borderRadius: "12px", fontSize: "15px", color: selected ? "#1A1A1A" : "#AAAAAA",
          textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "space-between", transition: "all 0.2s ease",
          boxShadow: open ? "0 0 0 4px rgba(252,174,145,0.12)" : "none",
          outline: "none", fontFamily: "inherit",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {selected?.flag && <span>{selected.flag}</span>}
          {selected?.symbol && (
            <span style={{
              width: "22px", height: "22px", background: "rgba(252,174,145,0.15)", borderRadius: "6px",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, color: "#FCAE91",
            }}>{selected.symbol}</span>
          )}
          {selected?.label || placeholder}
        </span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease", flexShrink: 0 }}>
          <path d="M4 6L8 10L12 6" stroke="#AAAAAA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
          background: "white", border: "1.5px solid #EEEBE6", borderRadius: "14px",
          zIndex: 100, maxHeight: "200px", overflowY: "auto",
          boxShadow: "0 16px 48px rgba(26,26,26,0.12)", animation: "dropDown 0.15s cubic-bezier(0.34,1.1,0.64,1)",
        }}>
          {options.map((opt) => (
            <button
              key={opt.value} type="button" onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                width: "100%", padding: "10px 14px", background: opt.value === value ? "rgba(252,174,145,0.08)" : "transparent",
                border: "none", textAlign: "left", cursor: "pointer", fontSize: "14px", color: "#1A1A1A",
                display: "flex", alignItems: "center", gap: "8px", fontFamily: "inherit", transition: "background 0.15s ease",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = opt.value === value ? "rgba(252,174,145,0.1)" : "rgba(0,0,0,0.03)")}
              onMouseLeave={e => (e.currentTarget.style.background = opt.value === value ? "rgba(252,174,145,0.08)" : "transparent")}
            >
              {opt.flag && <span>{opt.flag}</span>}
              {opt.symbol && (
                <span style={{
                  width: "22px", height: "22px", background: opt.value === value ? "rgba(252,174,145,0.2)" : "rgba(0,0,0,0.05)",
                  borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "11px", fontWeight: 700, color: opt.value === value ? "#F9A08B" : "#888",
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

export function Step1Illustration() {
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
      <ellipse cx="160" cy="160" rx="140" ry="120" fill="url(#bg-glow)" />
      <circle cx="52" cy="68" r="6" fill="#FCAE91" opacity="0.4"><animateTransform attributeName="transform" type="translate" values="0,0;0,-8;0,0" dur="3s" repeatCount="indefinite" /></circle>
      <circle cx="268" cy="200" r="4" fill="#FCAE91" opacity="0.3"><animateTransform attributeName="transform" type="translate" values="0,0;0,6;0,0" dur="4s" repeatCount="indefinite" /></circle>
      <circle cx="290" cy="80" r="8" fill="#A3C9A8" opacity="0.25"><animateTransform attributeName="transform" type="translate" values="0,0;4,0;0,0" dur="5s" repeatCount="indefinite" /></circle>
      <g>
        <rect x="54" y="72" width="212" height="136" rx="18" fill="url(#card-shine)" />
        <rect x="54" y="72" width="212" height="136" rx="18" stroke="#F0EDE8" strokeWidth="1" />
        <rect x="64" y="82" width="212" height="136" rx="18" fill="#1A1A1A" opacity="0.06" />
        <rect x="72" y="92" width="120" height="10" rx="5" fill="#1A1A1A" opacity="0.12" />
        <rect x="72" y="108" width="80" height="7" rx="3.5" fill="#FCAE91" opacity="0.5" />
        <line x1="72" y1="126" x2="248" y2="126" stroke="#F0EDE8" strokeWidth="1" />
        <rect x="72" y="136" width="14" height="14" rx="4" fill="#FCAE91" opacity="0.3" />
        <rect x="94" y="139" width="90" height="7" rx="3.5" fill="#1A1A1A" opacity="0.1" />
        <rect x="72" y="158" width="14" height="14" rx="4" fill="#A3C9A8" opacity="0.4" />
        <rect x="94" y="161" width="70" height="7" rx="3.5" fill="#1A1A1A" opacity="0.1" />
        <rect x="168" y="152" width="72" height="24" rx="8" fill="#1A1A1A" opacity="0.06" />
        <rect x="176" y="158" width="56" height="7" rx="3.5" fill="#1A1A1A" opacity="0.12" />
        <circle cx="236" cy="104" r="16" fill="#F5F0EB" />
        <circle cx="236" cy="100" r="6" fill="#FCAE91" opacity="0.5" />
        <ellipse cx="236" cy="116" rx="10" ry="6" fill="#FCAE91" opacity="0.3" />
      </g>
      <g opacity="0.85"><animateTransform attributeName="transform" type="translate" values="0,0;3,-5;0,0" dur="4s" repeatCount="indefinite" additive="sum" /><rect x="210" y="44" width="88" height="44" rx="12" fill="white" /><rect x="210" y="44" width="88" height="44" rx="12" stroke="#F0EDE8" strokeWidth="1" /><rect x="222" y="56" width="40" height="6" rx="3" fill="#1A1A1A" opacity="0.12" /><rect x="222" y="66" width="28" height="5" rx="2.5" fill="#FCAE91" opacity="0.6" /><circle cx="279" cy="62" r="8" fill="#F5F0EB" /><path d="M276 62 L279 65 L283 59" stroke="#A3C9A8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></g>
      <g opacity="0.8"><animateTransform attributeName="transform" type="translate" values="0,0;-4,4;0,0" dur="5s" repeatCount="indefinite" additive="sum" /><rect x="24" y="180" width="76" height="40" rx="10" fill="white" /><rect x="24" y="180" width="76" height="40" rx="10" stroke="#F0EDE8" strokeWidth="1" /><rect x="34" y="190" width="34" height="5" rx="2.5" fill="#1A1A1A" opacity="0.1" /><rect x="34" y="199" width="24" height="5" rx="2.5" fill="#FCAE91" opacity="0.4" /><rect x="34" y="208" width="44" height="4" rx="2" fill="#1A1A1A" opacity="0.07" /></g>
      <g fill="#FCAE91">
        <path d="M36 120 L38 114 L40 120 L46 122 L40 124 L38 130 L36 124 L30 122 Z" opacity="0.35"><animateTransform attributeName="transform" type="rotate" values="0 38 122;360 38 122" dur="8s" repeatCount="indefinite" /></path>
        <path d="M270 136 L271.5 132 L273 136 L277 137.5 L273 139 L271.5 143 L270 139 L266 137.5 Z" opacity="0.25"><animateTransform attributeName="transform" type="rotate" values="360 271.5 137.5;0 271.5 137.5" dur="10s" repeatCount="indefinite" /></path>
      </g>
    </svg>
  );
}

export function Step2Illustration({ selected }: { selected: string }) {
  const icons: Record<string, string> = { fitness: "🏋️", beauty: "💆", medical: "🏥", education: "📚", pets: "🐾", auto: "🚗", other: "✦" };
  const selectedIcon = icons[selected] || "✦";
  return (
    <svg viewBox="0 0 320 280" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      <defs><radialGradient id="bg-glow2" cx="50%" cy="50%" r="55%"><stop offset="0%" stopColor="#FCAE91" stopOpacity="0.15" /><stop offset="100%" stopColor="#FCAE91" stopOpacity="0" /></radialGradient></defs>
      <ellipse cx="160" cy="145" rx="130" ry="110" fill="url(#bg-glow2)" />
      <circle cx="160" cy="140" r="52" fill="white" /><circle cx="160" cy="140" r="52" stroke="#F0EDE8" strokeWidth="1.5" /><circle cx="160" cy="140" r="40" fill="#FDFCFB" />
      <text x="160" y="155" textAnchor="middle" fontSize="34">{selectedIcon}</text>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const angle = (i / 7) * Math.PI * 2 - Math.PI / 2; const r = 90; const x = 160 + Math.cos(angle) * r; const y = 140 + Math.sin(angle) * r;
        const cat = BUSINESS_CATEGORIES[i]; const isSelected = selected === cat?.id;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={isSelected ? 20 : 15} fill={isSelected ? "#FCAE91" : "white"} stroke={isSelected ? "#F9A08B" : "#F0EDE8"} strokeWidth={isSelected ? 2 : 1} opacity={isSelected ? 1 : 0.7} />
            <text x={x} y={y + 5} textAnchor="middle" fontSize={isSelected ? "14" : "12"}>{cat?.icon}</text>
          </g>
        );
      })}
      {selected && BUSINESS_CATEGORIES.map((cat, i) => {
        if (cat.id !== selected) return null;
        const angle = (i / 7) * Math.PI * 2 - Math.PI / 2; const r = 70; const x = 160 + Math.cos(angle) * r; const y = 140 + Math.sin(angle) * r;
        return <line key={cat.id} x1="160" y1="140" x2={x} y2={y} stroke="#FCAE91" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.5" />;
      })}
      {selected && (
        <g><rect x="90" y="215" width="140" height="28" rx="8" fill="#FCAE91" opacity="0.12" /><text x="160" y="233" textAnchor="middle" fontSize="12" fill="#1A1A1A" fontWeight="600" opacity="0.6">{BUSINESS_CATEGORIES.find(c => c.id === selected)?.label}</text></g>
      )}
    </svg>
  );
}

export function Step3Illustration() {
  return (
    <svg viewBox="0 0 320 280" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      <defs>
        <radialGradient id="globe-grad" cx="40%" cy="35%" r="60%"><stop offset="0%" stopColor="#E8F5FF" /><stop offset="100%" stopColor="#C5E4FF" /></radialGradient>
        <radialGradient id="bg-glow3" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#FCAE91" stopOpacity="0.12" /><stop offset="100%" stopColor="#FCAE91" stopOpacity="0" /></radialGradient>
        <clipPath id="globe-clip"><circle cx="160" cy="132" r="72" /></clipPath>
      </defs>
      <ellipse cx="160" cy="145" rx="140" ry="115" fill="url(#bg-glow3)" />
      <circle cx="160" cy="132" r="72" fill="url(#globe-grad)" /><circle cx="160" cy="132" r="72" stroke="#D0E8F8" strokeWidth="1.5" />
      <g clipPath="url(#globe-clip)" opacity="0.6">
        <path d="M152 90 C165 84 185 86 198 92 C208 96 212 106 210 114 C208 122 200 126 190 124 C178 122 168 128 162 124 C154 120 148 112 150 104 C152 98 150 94 152 90 Z" fill="#A3C9A8" opacity="0.5" />
        <path d="M148 118 C152 114 160 116 164 122 C168 130 166 142 160 146 C154 150 146 146 144 138 C142 130 144 122 148 118 Z" fill="#A3C9A8" opacity="0.45" />
        <path d="M110 96 C116 92 122 96 124 104 C126 112 122 122 116 126 C110 130 104 126 104 118 C104 110 106 100 110 96 Z" fill="#A3C9A8" opacity="0.4" />
        <path d="M194 136 C200 134 206 138 206 144 C206 150 200 154 194 152 C188 150 186 144 190 140 L194 136 Z" fill="#A3C9A8" opacity="0.4" />
      </g>
      <g clipPath="url(#globe-clip)" opacity="0.2">{[-40, -20, 0, 20, 40].map((lat, i) => <ellipse key={i} cx="160" cy={132 + lat} rx={Math.sqrt(72 * 72 - lat * lat) * 0.98} ry="4" fill="none" stroke="#4A9CD6" strokeWidth="0.5" />)}</g>
      <g clipPath="url(#globe-clip)" opacity="0.15">{[-40, -20, 0, 20, 40].map((lon, i) => <ellipse key={i} cx="160" cy="132" rx="4" ry="72" fill="none" stroke="#4A9CD6" strokeWidth="0.5" transform={`rotate(${(lon / 90) * 45} 160 132)`} />)}</g>
      <circle cx="135" cy="110" r="20" fill="white" opacity="0.15" />
      <g><animateTransform attributeName="transform" type="translate" values="0,0;0,-4;0,0" dur="2s" repeatCount="indefinite" additive="sum" /><path d="M160 92 C153 92 148 97 148 104 C148 114 160 124 160 124 C160 124 172 114 172 104 C172 97 167 92 160 92 Z" fill="#FCAE91" /><circle cx="160" cy="104" r="5" fill="white" /></g>
      <g opacity="0.9"><animateTransform attributeName="transform" type="translate" values="0,0;-3,-4;0,0" dur="3.5s" repeatCount="indefinite" additive="sum" /><rect x="20" y="84" width="68" height="26" rx="8" fill="white" /><rect x="20" y="84" width="68" height="26" rx="8" stroke="#F0EDE8" strokeWidth="1" /><text x="32" y="100" fontSize="13">🇷🇺</text><rect x="50" y="93" width="30" height="5" rx="2.5" fill="#1A1A1A" opacity="0.15" /></g>
      <g opacity="0.85"><animateTransform attributeName="transform" type="translate" values="0,0;4,-3;0,0" dur="4.5s" repeatCount="indefinite" additive="sum" /><rect x="232" y="68" width="72" height="26" rx="8" fill="white" /><rect x="232" y="68" width="72" height="26" rx="8" stroke="#F0EDE8" strokeWidth="1" /><text x="244" y="84" fontSize="13">💰</text><text x="264" y="84" fontSize="10" fill="#1A1A1A" opacity="0.4" fontWeight="600">RUB ₽</text></g>
      <g opacity="0.8"><animateTransform attributeName="transform" type="translate" values="0,0;3,5;0,0" dur="5s" repeatCount="indefinite" additive="sum" /><rect x="238" y="168" width="72" height="26" rx="8" fill="white" /><rect x="238" y="168" width="72" height="26" rx="8" stroke="#F0EDE8" strokeWidth="1" /><text x="250" y="184" fontSize="13">🕐</text><rect x="270" y="179" width="32" height="5" rx="2.5" fill="#1A1A1A" opacity="0.15" /></g>
      <rect x="100" y="222" width="120" height="28" rx="8" fill="#1A1A1A" opacity="0.04" /><text x="160" y="240" textAnchor="middle" fontSize="11" fill="#1A1A1A" opacity="0.35" fontWeight="500">Ваши настройки региона</text>
    </svg>
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