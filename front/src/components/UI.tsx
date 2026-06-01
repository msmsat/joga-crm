import { GoogleIcon } from "./Icons";
import { useState, useEffect, useRef } from "react";

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

// ─── INPUT FIELD (С нашими оптическими правками) ──────────────────────────────
export function InputField({ label, type = "text", placeholder, value, onChange, icon, rightSlot, error }: any) {
  const hasValue = value.length > 0;
  return (
    <div className="input-wrapper">
      <label className="input-label">{label}</label>
      <div className="input-container">
        {icon && <div className="input-icon-left">{icon}</div>}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`input-field ${hasValue ? 'has-value' : ''} ${error ? 'has-error' : ''}`}
          style={{ paddingLeft: icon ? "48px" : "16px", paddingRight: rightSlot ? "48px" : "16px" }}
        />
        {rightSlot && <div className="input-icon-right">{rightSlot}</div>}
      </div>
      {error && (
        <p style={{ fontSize: "12px", color: "var(--rose)", margin: "4px 0 0 2px", display: "flex", alignItems: "center", gap: "4px" }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5.5" stroke="var(--rose)" />
            <path d="M6 3.5V6.5" stroke="var(--rose)" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="6" cy="8.5" r="0.75" fill="var(--rose)" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

// ─── IDENTIFIER TABS ──────────────────────────────────────────────────────────
export type IdentifierMode = "email" | "phone" | "name";
export function IdentifierTabs({ active, onChange }: { active: IdentifierMode; onChange: (m: IdentifierMode) => void }) {
  const tabs: { key: IdentifierMode; label: string }[] = [{ key: "email", label: "Email" }, { key: "phone", label: "Телефон" }, { key: "name", label: "Имя" }];
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
          {["⬛","📅","👥","💬","📊","⚙️"].map((ico,i) => <div key={i} style={{ width:"34px",height:"34px",borderRadius:"9px", background: i===0 ? `linear-gradient(135deg, var(--peach-light), var(--peach))` : "transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"15px", cursor:"pointer" }}>{ico}</div>)}
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