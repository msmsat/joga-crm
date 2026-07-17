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

export const ACTIVITY_TYPES = [
  {
    id: "yoga",
    label: "Йога",
    description: "Хатха, аштанга, виньяса",
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
    label: "Пилатес",
    description: "Реформер, матовый пилатес",
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
];

export const DATE_FORMATS = [
  { value: "DD.MM.YYYY", label: "31.12.2026" },
  { value: "MM/DD/YYYY", label: "12/31/2026" },
  { value: "YYYY-MM-DD", label: "2026-12-31" },
];

export const WEEK_START_OPTIONS = [
  { value: "monday", label: "Понедельник" },
  { value: "sunday", label: "Воскресенье" },
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
          background: "#1E1E1E", border: "1.5px solid rgba(255,255,255,0.08)", borderRadius: "14px",
          zIndex: 100, maxHeight: "200px", overflowY: "auto",
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
        </div>
      )}
    </div>
  );
}

// ─── ONBOARDING ILLUSTRATIONS (Live, reactive) ────────────────────────────────

export function Illustration1({ studioName, logoPreviewUrl }: { studioName: string; logoPreviewUrl: string }) {
  const initial = studioName.trim().charAt(0).toUpperCase() || '';
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
      <div style={{
        width: '200px', background: 'white', borderRadius: '18px',
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
            <div style={{ fontWeight: 800, fontSize: '12px', color: studioName ? '#1A1A1A' : '#AAAAAA', letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {studioName || 'Название студии'}
            </div>
            <div style={{ fontSize: '10px', color: '#AAAAAA', marginTop: '1px' }}>Velora CRM</div>
          </div>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#A3C9A8', animation: 'stepPulse 2s infinite' }} />
        </div>
        <div style={{ padding: '12px 16px 10px' }}>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
            {[{ v: '248', l: 'Клиентов', c: '#FCAE91' }, { v: '94%', l: 'Посещ.', c: '#A3C9A8' }].map((s, i) => (
              <div key={i} style={{ flex: 1, padding: '8px', background: '#FDFCFB', borderRadius: '8px', border: '1px solid #F0EDE8' }}>
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
          Студия создана
        </div>
      )}
    </div>
  );
}

export function Illustration2({ activityType }: { activityType: string }) {
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
        <g>
          <animateTransform attributeName="transform" type="translate" values="0,0;0,-6;0,0" dur="4s" repeatCount="indefinite" additive="sum"/>
          <circle cx="140" cy="58" r="14" fill="white" stroke="#F0EDE8" strokeWidth="1.5"/>
          <circle cx="140" cy="58" r="8" fill="#FDFCFB"/>
          <path d="M140 72 L140 100" stroke="#FCAE91" strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M140 84 L122 98" stroke="#FCAE91" strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M140 84 L158 98" stroke="#FCAE91" strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M140 100 C128 104 108 104 100 116" stroke="#FCAE91" strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M140 100 C152 104 172 104 180 116" stroke="#FCAE91" strokeWidth="2.5" strokeLinecap="round"/>
          <path d="M94 120 Q140 132 186 120" stroke="#FCAE91" strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
        </g>
        <circle cx="198" cy="56" r="4" fill="#FCAE91" opacity="0.35"><animateTransform attributeName="transform" type="translate" values="0,0;4,-5;0,0" dur="3s" repeatCount="indefinite" additive="sum"/></circle>
        <circle cx="82" cy="82" r="3" fill="#A3C9A8" opacity="0.4"><animateTransform attributeName="transform" type="translate" values="0,0;-3,4;0,0" dur="4.5s" repeatCount="indefinite" additive="sum"/></circle>
        <circle cx="210" cy="148" r="5" fill="#FCAE91" opacity="0.2"><animateTransform attributeName="transform" type="translate" values="0,0;5,4;0,0" dur="5s" repeatCount="indefinite" additive="sum"/></circle>
        <text x="140" y="196" textAnchor="middle" fontSize="11" fill="#AAAAAA" fontWeight="600" fontFamily="inherit">Йога</text>
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
        <rect x="48" y="140" width="184" height="8" rx="4" fill="#F0EDE8"/>
        <rect x="58" y="128" width="164" height="16" rx="5" fill="white" stroke="#F0EDE8" strokeWidth="1.5"/>
        {[0,1,2,3].map(i => <line key={i} x1={136 + i * 18} y1="128" x2={136 + i * 18} y2="144" stroke="#E8E4DF" strokeWidth="1.5" strokeDasharray="2 2"/>)}
        <rect x="68" y="120" width="62" height="13" rx="4" fill="rgba(252,174,145,0.18)" stroke="#FCAE91" strokeWidth="1.5">
          <animate attributeName="x" values="68;106;68" dur="3.5s" repeatCount="indefinite" calcMode="spline" keySplines="0.45,0,0.55,1;0.45,0,0.55,1"/>
        </rect>
        <g>
          <animateTransform attributeName="transform" type="translate" values="0,0;38,0;0,0" dur="3.5s" repeatCount="indefinite" calcMode="spline" keySplines="0.45,0,0.55,1;0.45,0,0.55,1" additive="sum"/>
          <circle cx="84" cy="114" r="11" fill="white" stroke="#F0EDE8" strokeWidth="1.5"/>
          <circle cx="84" cy="114" r="6" fill="#FDFCFB"/>
          <path d="M84 125 L84 136" stroke="#FCAE91" strokeWidth="2" strokeLinecap="round"/>
          <path d="M84 130 L73 125" stroke="#FCAE91" strokeWidth="2" strokeLinecap="round"/>
          <path d="M84 130 L97 128" stroke="#FCAE91" strokeWidth="2" strokeLinecap="round"/>
        </g>
        <circle cx="68" cy="74" r="3.5" fill="#FCAE91" opacity="0.3"><animateTransform attributeName="transform" type="translate" values="0,0;-3,-5;0,0" dur="4s" repeatCount="indefinite" additive="sum"/></circle>
        <circle cx="216" cy="90" r="5" fill="#A3C9A8" opacity="0.25"><animateTransform attributeName="transform" type="translate" values="0,0;4,4;0,0" dur="5s" repeatCount="indefinite" additive="sum"/></circle>
        <text x="140" y="196" textAnchor="middle" fontSize="11" fill="#AAAAAA" fontWeight="600" fontFamily="inherit">Пилатес</text>
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
      <text x="140" y="185" textAnchor="middle" fontSize="11" fill="#CCCCCC" fontWeight="500" fontFamily="inherit">Выберите направление</text>
    </svg>
  );
}

export function Illustration3({ phone, email, address }: { phone: string; email: string; address: string }) {
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
        <div style={{ background: 'white', border: `1.5px solid ${hasPhone ? 'rgba(252,174,145,0.4)' : '#F0EDE8'}`, borderRadius: '12px', padding: '10px 14px', boxShadow: hasPhone ? '0 8px 24px rgba(252,174,145,0.14)' : '0 4px 12px rgba(26,26,26,0.05)', transition: 'all 0.4s ease' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, color: '#AAAAAA', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Телефон</div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: hasPhone ? '#1A1A1A' : '#CCCCCC', whiteSpace: 'nowrap' }}>{hasPhone ? (phone.length > 13 ? phone.slice(0, 13) : phone) : '+7 (___) ___'}</div>
        </div>
      </div>
      <div style={{ position: 'absolute', top: '8px', right: '8px', transition: 'all 0.4s ease', opacity: hasEmail ? 1 : 0.4, animation: 'floatLogin1 6s ease-in-out infinite' }}>
        <div style={{ background: 'white', border: `1.5px solid ${hasEmail ? 'rgba(163,201,168,0.4)' : '#F0EDE8'}`, borderRadius: '12px', padding: '10px 14px', boxShadow: hasEmail ? '0 8px 24px rgba(163,201,168,0.14)' : '0 4px 12px rgba(26,26,26,0.05)', transition: 'all 0.4s ease' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, color: '#AAAAAA', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Email</div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: hasEmail ? '#1A1A1A' : '#CCCCCC', whiteSpace: 'nowrap' }}>{hasEmail ? (email.length > 15 ? email.slice(0, 12) + '…' : email) : 'studio@mail.ru'}</div>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', transition: 'all 0.4s ease', opacity: hasAddress ? 1 : 0.4, animation: 'floatLogin3 7s ease-in-out infinite' }}>
        <div style={{ background: 'white', border: `1.5px solid ${hasAddress ? 'rgba(252,174,145,0.35)' : '#F0EDE8'}`, borderRadius: '12px', padding: '10px 14px', boxShadow: hasAddress ? '0 8px 24px rgba(252,174,145,0.12)' : '0 4px 12px rgba(26,26,26,0.05)', transition: 'all 0.4s ease', whiteSpace: 'nowrap' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, color: '#AAAAAA', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>Адрес</div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: hasAddress ? '#1A1A1A' : '#CCCCCC' }}>{hasAddress ? (address.length > 18 ? address.slice(0, 15) + '…' : address) : 'ул. Пушкина, 1'}</div>
        </div>
      </div>
    </div>
  );
}

export function Illustration4({ timezone, currency, language }: { timezone: string; currency: string; language: string }) {
  const curr = CURRENCIES.find(c => c.value === currency);
  const lang = LANGUAGES.find(l => l.value === language);
  const tz = TIMEZONES.find(t => t.value === timezone);
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '4px 0' }}>
      <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'white', border: '2px solid #F0EDE8', boxShadow: '0 8px 24px rgba(26,26,26,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', animation: 'floatLogin1 5s ease-in-out infinite', flexShrink: 0 }}>
        <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
          <circle cx="21" cy="21" r="18" stroke="#F0EDE8" strokeWidth="1.5"/>
          <path d="M21 9 L21 21 L30 21" stroke="#FCAE91" strokeWidth="2" strokeLinecap="round"/>
          <circle cx="21" cy="21" r="2.5" fill="#FCAE91"/>
        </svg>
        <div style={{ position: 'absolute', bottom: '-10px', right: '-10px', background: '#1A1A1A', borderRadius: '8px', padding: '3px 7px', fontSize: '10px', fontWeight: 700, color: 'white', whiteSpace: 'nowrap' }}>
          {timezone || 'UTC+3'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
        <div style={{ background: 'white', border: '1.5px solid #F0EDE8', borderRadius: '12px', padding: '10px 16px', boxShadow: '0 4px 14px rgba(26,26,26,0.06)', textAlign: 'center', animation: 'floatLogin2 6s ease-in-out infinite' }}>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#FCAE91', lineHeight: '1' }}>{curr?.symbol || '₽'}</div>
          <div style={{ fontSize: '9px', color: '#AAAAAA', fontWeight: 600, marginTop: '4px' }}>{curr?.label || 'Рубль'}</div>
        </div>
        <div style={{ background: 'white', border: '1.5px solid #F0EDE8', borderRadius: '12px', padding: '10px 16px', boxShadow: '0 4px 14px rgba(26,26,26,0.06)', textAlign: 'center', animation: 'floatLogin3 7s ease-in-out infinite' }}>
          <div style={{ fontSize: '20px', lineHeight: '1' }}>{lang?.flag || '🇷🇺'}</div>
          <div style={{ fontSize: '9px', color: '#AAAAAA', fontWeight: 600, marginTop: '4px' }}>{lang?.label?.slice(0, 8) || 'Русский'}</div>
        </div>
      </div>
      {tz && <div style={{ fontSize: '11px', color: '#AAAAAA', fontWeight: 500 }}>{tz.label}</div>}
    </div>
  );
}

export function Illustration5({ workingHours }: { workingHours: Array<{ dayOfWeek: number; isOpen: boolean; openTime: string; closeTime: string }> }) {
  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  return (
    <div style={{ width: '100%', padding: '0 4px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
      {workingHours.map((day, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.3s ease' }}>
          <span style={{ width: '22px', fontSize: '10px', fontWeight: 700, color: day.isOpen ? '#1A1A1A' : '#CCCCCC', flexShrink: 0, transition: 'color 0.3s ease' }}>
            {dayNames[idx]}
          </span>
          <div style={{ flex: 1, height: '20px', borderRadius: '6px', background: day.isOpen ? 'linear-gradient(90deg, rgba(252,174,145,0.28), rgba(252,174,145,0.12))' : 'rgba(26,26,26,0.04)', transition: 'all 0.35s cubic-bezier(0.34,1.1,0.64,1)', display: 'flex', alignItems: 'center', paddingLeft: '8px' }}>
            {day.isOpen
              ? <span style={{ fontSize: '9px', fontWeight: 600, color: '#F9A08B', whiteSpace: 'nowrap' }}>{day.openTime} – {day.closeTime}</span>
              : <span style={{ fontSize: '9px', color: '#CCCCCC', fontStyle: 'italic' }}>выходной</span>
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