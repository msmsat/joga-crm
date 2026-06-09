import { useState, useEffect, useRef } from "react";

// ─── SVG ICONS ────────────────────────────────────────────────────────────────
const icons = {
  building: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 9h6M9 13h6M9 17h6"/>
    </svg>
  ),
  clock: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
    </svg>
  ),
  globe: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><path d="M12 3a15 15 0 010 18M3 12h18"/>
    </svg>
  ),
  currency: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><path d="M14.5 8H10a2 2 0 000 4h4a2 2 0 010 4H9M12 6v12"/>
    </svg>
  ),
  bell: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
  ),
  shield: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l8 4v5c0 5-4 9-8 10C8 21 4 17 4 12V7l8-4z"/>
    </svg>
  ),
  users: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
    </svg>
  ),
  creditCard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="3"/><path d="M1 10h22"/>
    </svg>
  ),
  link: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
    </svg>
  ),
  edit: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  chevronRight: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6"/>
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
  ),
  sun: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
    </svg>
  ),
  moon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
    </svg>
  ),
  smartphone: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="17" r="1"/>
    </svg>
  ),
  mail: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/>
    </svg>
  ),
  database: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </svg>
  ),
  zap: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
  ),
  palette: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.5" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  ),
  trash: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
    </svg>
  ),
  download: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  key: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  ),
  toggle: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="5" width="22" height="14" rx="7"/><circle cx="16" cy="12" r="3" fill="currentColor" stroke="none"/>
    </svg>
  ),
  calendar: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  ),
  phone: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8a19.79 19.79 0 01-3.07-8.7A2 2 0 012.18 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.15a16 16 0 006.94 6.94l1.51-1.51a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
    </svg>
  ),
  plus: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
    </svg>
  ),
  alertTriangle: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  logout: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
    </svg>
  ),
  copy: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  ),
  eye: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
};

// ─── TOGGLE COMPONENT ─────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: "44px", height: "24px",
        background: checked ? "var(--peach)" : "var(--border-strong)",
        borderRadius: "100px",
        border: "none",
        cursor: "pointer",
        position: "relative",
        transition: "background 0.25s cubic-bezier(.4,0,.2,1)",
        flexShrink: 0,
        outline: "none",
      }}
    >
      <div style={{
        position: "absolute",
        top: "3px",
        left: checked ? "23px" : "3px",
        width: "18px", height: "18px",
        background: "white",
        borderRadius: "50%",
        transition: "left 0.25s cubic-bezier(.4,0,.2,1)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
      }} />
    </button>
  );
}

// ─── BADGE COMPONENT ──────────────────────────────────────────────────────────
function StatusBadge({ type, children }: { type: "active" | "warning" | "info"; children: React.ReactNode }) {
  const colors = {
    active: { bg: "rgba(163,201,168,0.15)", color: "#5A9A65", border: "rgba(163,201,168,0.35)" },
    warning: { bg: "rgba(216,140,154,0.12)", color: "#C0607A", border: "rgba(216,140,154,0.3)" },
    info: { bg: "rgba(252,174,145,0.12)", color: "#C8784A", border: "rgba(252,174,145,0.35)" },
  };
  const c = colors[type];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      padding: "3px 10px", borderRadius: "100px",
      background: c.bg, color: c.color,
      border: `1px solid ${c.border}`,
      fontSize: "11px", fontWeight: 700, letterSpacing: "0.2px",
    }}>
      {children}
    </span>
  );
}

// ─── SECTION HEADER ───────────────────────────────────────────────────────────
function SectionHeader({ icon, title, subtitle, accent }: { icon: React.ReactNode; title: string; subtitle: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "28px" }}>
      <div style={{
        width: "40px", height: "40px",
        borderRadius: "12px",
        background: accent ? "var(--peach)" : "rgba(252,174,145,0.12)",
        color: accent ? "white" : "var(--peach)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--onyx)", letterSpacing: "-0.3px" }}>{title}</div>
        <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "1px" }}>{subtitle}</div>
      </div>
    </div>
  );
}

// ─── SETTINGS ROW ─────────────────────────────────────────────────────────────
function SettingsRow({
  label, value, sub, onEdit, tag, danger,
}: {
  label: string; value?: string; sub?: string; onEdit?: () => void; tag?: React.ReactNode; danger?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px",
        borderRadius: "10px",
        background: hovered ? "rgba(252,174,145,0.05)" : "transparent",
        transition: "background 0.2s ease",
        cursor: "default",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: danger ? "#C0607A" : "var(--onyx)" }}>{label}</div>
        {(value || sub) && (
          <div style={{ fontSize: "12px", color: "var(--muted)" }}>{value || sub}</div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {tag}
        {onEdit && (
          <button
            onClick={onEdit}
            style={{
              display: "flex", alignItems: "center", gap: "5px",
              padding: "6px 12px",
              borderRadius: "8px",
              background: hovered ? "rgba(252,174,145,0.12)" : "transparent",
              border: `1px solid ${hovered ? "rgba(252,174,145,0.35)" : "var(--border)"}`,
              color: hovered ? "var(--peach)" : "var(--muted)",
              fontSize: "11px", fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            {icons.edit}
            Изменить
          </button>
        )}
      </div>
    </div>
  );
}

// ─── INPUT ROW ────────────────────────────────────────────────────────────────
function InputRow({ label, placeholder, defaultValue, type = "text" }: { label: string; placeholder?: string; defaultValue?: string; type?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", letterSpacing: "0.2px" }}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          padding: "10px 14px",
          borderRadius: "10px",
          border: `1.5px solid ${focused ? "var(--peach)" : "var(--border)"}`,
          background: focused ? "rgba(252,174,145,0.04)" : "transparent",
          fontSize: "13px", color: "var(--onyx)",
          outline: "none",
          transition: "all 0.2s ease",
          boxShadow: focused ? "0 0 0 3px rgba(252,174,145,0.12)" : "none",
          fontFamily: "inherit",
        }}
      />
    </div>
  );
}

// ─── NAV SIDEBAR ITEM ─────────────────────────────────────────────────────────
function NavItem({ icon, label, active, onClick, badge }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: "10px",
        width: "100%", padding: "10px 14px",
        borderRadius: "10px",
        background: active ? "rgba(252,174,145,0.12)" : "transparent",
        border: "none",
        color: active ? "var(--peach)" : "var(--muted)",
        fontSize: "13px", fontWeight: active ? 700 : 500,
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.18s ease",
        position: "relative",
      }}
    >
      <span style={{ color: active ? "var(--peach)" : "var(--muted)", transition: "color 0.18s" }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge !== undefined && (
        <span style={{
          width: "18px", height: "18px",
          background: "var(--peach)", color: "white",
          borderRadius: "50%", fontSize: "10px", fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>{badge}</span>
      )}
      {active && (
        <div style={{
          position: "absolute", left: "0", top: "50%",
          transform: "translateY(-50%)",
          width: "3px", height: "20px",
          background: "var(--peach)", borderRadius: "0 2px 2px 0",
        }} />
      )}
    </button>
  );
}

// ─── DAY HOURS ROW ────────────────────────────────────────────────────────────
function DayHoursRow({ day, from, to, active: initActive }: { day: string; from: string; to: string; active: boolean }) {
  const [active, setActive] = useState(initActive);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "16px",
      padding: "12px 16px", borderRadius: "10px",
      background: active ? "rgba(252,174,145,0.05)" : "rgba(0,0,0,0.02)",
      opacity: active ? 1 : 0.5,
      transition: "all 0.2s ease",
    }}>
      <Toggle checked={active} onChange={() => setActive(!active)} />
      <div style={{ width: "80px", fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{day}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, opacity: active ? 1 : 0.4 }}>
        <select
          defaultValue={from}
          disabled={!active}
          style={{
            padding: "6px 10px", borderRadius: "8px",
            border: "1.5px solid var(--border)",
            background: "var(--bg-card)", color: "var(--onyx)",
            fontSize: "12px", fontWeight: 600, cursor: active ? "pointer" : "default",
            outline: "none", fontFamily: "inherit",
          }}
        >
          {["07:00","08:00","09:00","10:00"].map(t => <option key={t}>{t}</option>)}
        </select>
        <span style={{ color: "var(--muted)", fontSize: "12px" }}>—</span>
        <select
          defaultValue={to}
          disabled={!active}
          style={{
            padding: "6px 10px", borderRadius: "8px",
            border: "1.5px solid var(--border)",
            background: "var(--bg-card)", color: "var(--onyx)",
            fontSize: "12px", fontWeight: 600, cursor: active ? "pointer" : "default",
            outline: "none", fontFamily: "inherit",
          }}
        >
          {["18:00","19:00","20:00","21:00","22:00"].map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
    </div>
  );
}

// ─── ILLUSTRATION COMPONENTS ─────────────────────────────────────────────────
function SecurityIllustration() {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { setTimeout(() => setAnimated(true), 300); }, []);
  return (
    <div style={{ position: "relative", width: "100%", height: "140px", overflow: "hidden" }}>
      {/* Shield */}
      <div style={{
        position: "absolute", left: "50%", top: "50%",
        transform: `translate(-50%, -50%) scale(${animated ? 1 : 0.7})`,
        opacity: animated ? 1 : 0,
        transition: "all 0.6s cubic-bezier(.34,1.4,.64,1)",
        width: "80px", height: "90px",
        background: "linear-gradient(160deg, rgba(252,174,145,0.2), rgba(252,174,145,0.06))",
        borderRadius: "50% 50% 40% 40% / 60% 60% 40% 40%",
        border: "1.5px solid rgba(252,174,145,0.3)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--peach)" strokeWidth="1.5" strokeLinecap="round">
          <path d="M12 3l8 4v5c0 5-4 9-8 10C8 21 4 17 4 12V7l8-4z"/>
          <path d="M9 12l2 2 4-4"/>
        </svg>
      </div>
      {/* Orbiting dots */}
      {[0, 60, 120, 180, 240, 300].map((deg, i) => (
        <div key={i} style={{
          position: "absolute",
          left: "50%", top: "50%",
          width: "6px", height: "6px",
          borderRadius: "50%",
          background: i % 2 === 0 ? "rgba(252,174,145,0.6)" : "rgba(163,201,168,0.6)",
          transform: `translate(-50%, -50%) rotate(${deg}deg) translateX(52px)`,
          opacity: animated ? 1 : 0,
          transition: `all 0.4s ease ${0.2 + i * 0.08}s`,
          animation: animated ? `orbit-${i} 6s linear infinite` : "none",
        }} />
      ))}
      {/* Rings */}
      {[72, 96].map((size, i) => (
        <div key={i} style={{
          position: "absolute", left: "50%", top: "50%",
          width: `${size}px`, height: `${size}px`,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          border: `1px solid rgba(252,174,145,${0.12 - i * 0.04})`,
          opacity: animated ? 1 : 0,
          transition: `opacity 0.4s ease ${0.3 + i * 0.1}s`,
        }} />
      ))}
    </div>
  );
}

function NotificationIllustration() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % 4), 1400);
    return () => clearInterval(t);
  }, []);
  const notifs = [
    { icon: icons.mail, text: "Новая запись от Анны К.", color: "var(--peach)" },
    { icon: icons.bell, text: "Оплата подтверждена", color: "#A3C9A8" },
    { icon: icons.smartphone, text: "Push: Напоминание о визите", color: "#9BB5D8" },
  ];
  return (
    <div style={{ padding: "12px 0 4px", display: "flex", flexDirection: "column", gap: "8px" }}>
      {notifs.map((n, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "10px 14px", borderRadius: "10px",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          transform: step === i ? "translateX(4px)" : "none",
          opacity: step === i ? 1 : 0.55,
          transition: "all 0.35s ease",
          boxShadow: step === i ? "0 4px 16px rgba(0,0,0,0.06)" : "none",
        }}>
          <div style={{
            width: "28px", height: "28px", borderRadius: "8px",
            background: `${n.color}20`, color: n.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>{n.icon}</div>
          <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--onyx)" }}>{n.text}</div>
          <div style={{
            marginLeft: "auto", width: "6px", height: "6px", borderRadius: "50%",
            background: n.color, flexShrink: 0,
            opacity: step === i ? 1 : 0,
          }} />
        </div>
      ))}
    </div>
  );
}

function IntegrationIllustration() {
  const logos = [
    { name: "WhatsApp", color: "#25D366" },
    { name: "Telegram", color: "#229ED9" },
    { name: "Instagram", color: "#E1306C" },
    { name: "1С", color: "#EF3B2C" },
  ];
  const [active, setActive] = useState<number | null>(null);
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: "12px", padding: "16px 0",
    }}>
      <div style={{
        width: "44px", height: "44px", borderRadius: "12px",
        background: "linear-gradient(135deg, var(--peach), #f0876a)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 16px rgba(252,174,145,0.4)",
        flexShrink: 0,
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {logos.map((l, i) => (
          <div key={i} style={{
            height: "2px", width: active === i ? "60px" : "40px",
            background: `linear-gradient(90deg, var(--peach), ${l.color})`,
            borderRadius: "2px", opacity: active === i ? 1 : 0.35,
            transition: "all 0.25s ease",
          }} />
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        {logos.map((l, i) => (
          <div
            key={i}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            style={{
              width: "36px", height: "36px", borderRadius: "10px",
              background: `${l.color}18`,
              border: `1.5px solid ${l.color}35`,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
              transform: active === i ? "scale(1.1)" : "scale(1)",
              transition: "transform 0.2s ease",
            }}
          >
            <span style={{ fontSize: "10px", fontWeight: 800, color: l.color }}>{l.name.slice(0, 2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN SETTINGS COMPONENT ─────────────────────────────────────────────────
export default function Settings() {
  const [activeSection, setActiveSection] = useState("general");
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState({
    email: true, sms: false, push: true, marketing: false,
  });
  const [twoFa, setTwoFa] = useState(false);
  const [sessionAlert, setSessionAlert] = useState(true);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleSave = () => {
    setSavedIndicator(true);
    setTimeout(() => setSavedIndicator(false), 2200);
  };

  const handleCopy = () => {
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1800);
  };

  const navItems = [
    { id: "general", icon: icons.building, label: "Основные" },
    { id: "hours", icon: icons.calendar, label: "Рабочие часы" },
    { id: "appearance", icon: icons.palette, label: "Внешний вид" },
    { id: "notifications", icon: icons.bell, label: "Уведомления", badge: 2 },
    { id: "team", icon: icons.users, label: "Команда" },
    { id: "billing", icon: icons.creditCard, label: "Подписка" },
    { id: "security", icon: icons.shield, label: "Безопасность" },
    { id: "integrations", icon: icons.link, label: "Интеграции" },
    { id: "data", icon: icons.database, label: "Данные" },
  ];

  // Scroll content to top on section change
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeSection]);

  // ─── SECTION RENDERERS ───────────────────────────────────────────────────
  const renderGeneral = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Company identity card */}
      <div className="card" style={{ padding: "28px 28px 24px" }}>
        <SectionHeader icon={icons.building} title="Данные компании" subtitle="Публичная информация вашего бизнеса" />
        <div style={{ display: "flex", gap: "24px", marginBottom: "20px" }}>
          {/* Logo zone */}
          <div style={{
            width: "80px", height: "80px", borderRadius: "16px", flexShrink: 0,
            background: "linear-gradient(135deg, rgba(252,174,145,0.2), rgba(252,174,145,0.06))",
            border: "2px dashed rgba(252,174,145,0.35)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: "4px", cursor: "pointer",
            transition: "all 0.2s ease",
          }}
            onMouseOver={(e) => { e.currentTarget.style.background = "rgba(252,174,145,0.12)"; }}
            onMouseOut={(e) => { e.currentTarget.style.background = "linear-gradient(135deg, rgba(252,174,145,0.2), rgba(252,174,145,0.06))"; }}
          >
            {icons.plus}
            <span style={{ fontSize: "9px", color: "var(--muted)", fontWeight: 600 }}>Логотип</span>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
            <InputRow label="Название компании" defaultValue="Pilates & Wellness Studio" placeholder="Например: My Studio" />
            <InputRow label="Описание" placeholder="Чем занимается ваша студия…" />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
          <InputRow label="Телефон" defaultValue="+7 (495) 000-00-00" type="tel" />
          <InputRow label="Email" defaultValue="hello@studio.ru" type="email" />
          <InputRow label="Сайт" placeholder="https://studio.ru" />
          <InputRow label="Адрес" placeholder="Москва, ул. Примерная, 1" />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button className="topbar-ghost" style={{ padding: "9px 18px", fontSize: "12px" }}>Сбросить</button>
          <button
            onClick={handleSave}
            style={{
              display: "flex", alignItems: "center", gap: "7px",
              padding: "9px 22px", borderRadius: "10px",
              background: savedIndicator ? "#A3C9A8" : "var(--peach)",
              border: "none", color: "white",
              fontSize: "13px", fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.3s ease",
              boxShadow: savedIndicator ? "0 4px 16px rgba(163,201,168,0.4)" : "0 4px 16px rgba(252,174,145,0.35)",
            }}
          >
            {savedIndicator ? icons.check : icons.edit}
            {savedIndicator ? "Сохранено" : "Сохранить"}
          </button>
        </div>
      </div>

      {/* Locale settings */}
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.globe} title="Язык и регион" subtitle="Настройки локализации интерфейса" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <SettingsRow label="Часовой пояс" value="Europe/Moscow (UTC+3)" onEdit={() => {}} tag={<StatusBadge type="active">Авто</StatusBadge>} />
          <SettingsRow label="Валюта" value="RUB — Российский рубль (₽)" onEdit={() => {}} />
          <SettingsRow label="Язык интерфейса" value="Русский" onEdit={() => {}} />
          <SettingsRow label="Формат даты" value="ДД.ММ.ГГГГ" onEdit={() => {}} />
          <SettingsRow label="Первый день недели" value="Понедельник" onEdit={() => {}} />
        </div>
      </div>

      {/* Advanced */}
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.zap} title="Дополнительно" subtitle="Параметры системы и производительности" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <SettingsRow label="API-ключ" value="vel_live_••••••••••••••••4f2a" tag={
            <button onClick={handleCopy} style={{
              display: "flex", alignItems: "center", gap: "5px",
              padding: "5px 10px", borderRadius: "7px",
              border: "1px solid var(--border)", background: "transparent",
              color: copyFeedback ? "#5A9A65" : "var(--muted)",
              fontSize: "11px", fontWeight: 600, cursor: "pointer",
              transition: "all 0.2s ease",
            }}>
              {copyFeedback ? icons.check : icons.copy}
              {copyFeedback ? "Скопировано" : "Копировать"}
            </button>
          } />
          <SettingsRow label="ID аккаунта" value="#VEL-2024-98741" />
          <SettingsRow label="Версия системы" value="Velora 3.2.1" tag={<StatusBadge type="active">Актуальная</StatusBadge>} />
        </div>
      </div>
    </div>
  );

  const renderHours = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.calendar} title="Рабочие часы" subtitle="Настройте расписание для каждого дня недели" />
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "24px" }}>
          <DayHoursRow day="Понедельник" from="08:00" to="22:00" active />
          <DayHoursRow day="Вторник" from="08:00" to="22:00" active />
          <DayHoursRow day="Среда" from="08:00" to="22:00" active />
          <DayHoursRow day="Четверг" from="08:00" to="22:00" active />
          <DayHoursRow day="Пятница" from="08:00" to="21:00" active />
          <DayHoursRow day="Суббота" from="09:00" to="20:00" active />
          <DayHoursRow day="Воскресенье" from="10:00" to="18:00" active={false} />
        </div>
        <div style={{
          padding: "12px 16px",
          background: "rgba(252,174,145,0.06)", borderRadius: "10px",
          border: "1px solid rgba(252,174,145,0.2)",
          display: "flex", alignItems: "center", gap: "10px",
          marginBottom: "20px",
        }}>
          <span style={{ color: "var(--peach)" }}>{icons.info}</span>
          <span style={{ fontSize: "12px", color: "var(--muted)", lineHeight: "1.5" }}>
            Рабочие часы влияют на доступность онлайн-записи. Запись вне этих часов невозможна.
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={handleSave} style={{
            padding: "9px 22px", borderRadius: "10px",
            background: savedIndicator ? "#A3C9A8" : "var(--peach)",
            border: "none", color: "white",
            fontSize: "13px", fontWeight: 700, cursor: "pointer",
            transition: "all 0.3s ease",
          }}>
            {savedIndicator ? "Сохранено ✓" : "Сохранить расписание"}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.clock} title="Параметры записи" subtitle="Слоты, буфер и прочие ограничения" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "6px" }}>Длительность слота</label>
            <select style={{
              width: "100%", padding: "10px 14px", borderRadius: "10px",
              border: "1.5px solid var(--border)", background: "var(--bg-card)",
              color: "var(--onyx)", fontSize: "13px", fontWeight: 600,
              outline: "none", fontFamily: "inherit", cursor: "pointer",
            }}>
              <option>30 минут</option>
              <option selected>60 минут</option>
              <option>90 минут</option>
              <option>120 минут</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "6px" }}>Буфер между записями</label>
            <select style={{
              width: "100%", padding: "10px 14px", borderRadius: "10px",
              border: "1.5px solid var(--border)", background: "var(--bg-card)",
              color: "var(--onyx)", fontSize: "13px", fontWeight: 600,
              outline: "none", fontFamily: "inherit", cursor: "pointer",
            }}>
              <option>Нет</option>
              <option selected>10 минут</option>
              <option>15 минут</option>
              <option>30 минут</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "6px" }}>Мин. время до записи</label>
            <select style={{
              width: "100%", padding: "10px 14px", borderRadius: "10px",
              border: "1.5px solid var(--border)", background: "var(--bg-card)",
              color: "var(--onyx)", fontSize: "13px", fontWeight: 600,
              outline: "none", fontFamily: "inherit", cursor: "pointer",
            }}>
              <option>1 час</option>
              <option selected>2 часа</option>
              <option>4 часа</option>
              <option>1 день</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: "6px" }}>Запись вперёд до</label>
            <select style={{
              width: "100%", padding: "10px 14px", borderRadius: "10px",
              border: "1.5px solid var(--border)", background: "var(--bg-card)",
              color: "var(--onyx)", fontSize: "13px", fontWeight: 600,
              outline: "none", fontFamily: "inherit", cursor: "pointer",
            }}>
              <option>1 месяц</option>
              <option selected>2 месяца</option>
              <option>3 месяца</option>
              <option>6 месяцев</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAppearance = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.palette} title="Тема оформления" subtitle="Выберите визуальный стиль интерфейса" />
        <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
          {[
            { id: "light", label: "Светлая", icon: icons.sun, preview: ["#FDFCFB", "#FFFFFF", "#FCAE91"] },
            { id: "dark", label: "Тёмная", icon: icons.moon, preview: ["#121212", "#1E1E1E", "#FCAE91"] },
            { id: "auto", label: "Системная", icon: icons.toggle, preview: ["#ECECEC", "#F5F5F5", "#FCAE91"] },
          ].map((t) => {
            const selected = (t.id === "light" && !darkMode) || (t.id === "dark" && darkMode);
            return (
              <button
                key={t.id}
                onClick={() => t.id !== "auto" && setDarkMode(t.id === "dark")}
                style={{
                  flex: 1, padding: "16px 12px",
                  borderRadius: "12px",
                  border: `1.5px solid ${selected ? "var(--peach)" : "var(--border)"}`,
                  background: selected ? "rgba(252,174,145,0.07)" : "transparent",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: "10px",
                }}
              >
                <div style={{ display: "flex", gap: "4px" }}>
                  {t.preview.map((c, i) => (
                    <div key={i} style={{
                      width: i === 2 ? "12px" : "20px", height: "24px",
                      borderRadius: "4px", background: c,
                      border: "1px solid rgba(0,0,0,0.06)",
                    }} />
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "5px", color: selected ? "var(--peach)" : "var(--muted)" }}>
                  {t.icon}
                  <span style={{ fontSize: "12px", fontWeight: 600 }}>{t.label}</span>
                </div>
                {selected && (
                  <div style={{
                    width: "18px", height: "18px", borderRadius: "50%",
                    background: "var(--peach)", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {icons.check}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.zap} title="Акцентный цвет" subtitle="Персонализируйте главный цвет интерфейса" />
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
          {[
            { color: "#FCAE91", label: "Персиковый" },
            { color: "#A3C9A8", label: "Фисташковый" },
            { color: "#9BB5D8", label: "Лавандовый" },
            { color: "#D88C9A", label: "Розовый" },
            { color: "#E8C97A", label: "Золотой" },
            { color: "#8BBFBF", label: "Минт" },
          ].map((c, i) => (
            <button
              key={i}
              title={c.label}
              style={{
                width: "36px", height: "36px", borderRadius: "10px",
                background: c.color,
                border: i === 0 ? `3px solid ${c.color}` : "3px solid transparent",
                outline: i === 0 ? `2px solid white` : "none",
                cursor: "pointer",
                transition: "transform 0.15s ease",
                boxShadow: `0 4px 12px ${c.color}50`,
              }}
              onMouseOver={(e) => { e.currentTarget.style.transform = "scale(1.15)"; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
            />
          ))}
        </div>
        <div style={{
          padding: "14px 16px",
          background: "rgba(252,174,145,0.06)", borderRadius: "10px",
          border: "1px solid rgba(252,174,145,0.2)",
          fontSize: "12px", color: "var(--muted)",
        }}>
          Цвет акцента применяется к кнопкам, ссылкам, активным элементам и прогресс-индикаторам.
        </div>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.building} title="Компактный режим" subtitle="Уменьшить отступы и плотность интерфейса" />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>Плотная вёрстка</div>
            <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px" }}>Показывать больше данных на экране</div>
          </div>
          <Toggle checked={false} onChange={() => {}} />
        </div>
      </div>
    </div>
  );

  const renderNotifications = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.bell} title="Уведомления" subtitle="Настройте, как и когда получать оповещения" />
        <NotificationIllustration />
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "2px" }}>
          {[
            { key: "email" as const, label: "Email-уведомления", sub: "Новые записи, отмены, платежи" },
            { key: "sms" as const, label: "SMS-оповещения", sub: "Срочные уведомления на телефон" },
            { key: "push" as const, label: "Push-уведомления", sub: "Уведомления в браузере и приложении" },
            { key: "marketing" as const, label: "Маркетинговые рассылки", sub: "Обновления продукта, советы, акции" },
          ].map(({ key, label, sub }) => (
            <div key={key} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px", borderRadius: "10px",
              background: notifications[key] ? "rgba(252,174,145,0.04)" : "transparent",
              transition: "background 0.2s ease",
            }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{label}</div>
                <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "1px" }}>{sub}</div>
              </div>
              <Toggle checked={notifications[key]} onChange={() => setNotifications(p => ({ ...p, [key]: !p[key] }))} />
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.mail} title="Email для уведомлений" subtitle="Куда отправлять системные письма" />
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <InputRow label="Основной email" defaultValue="hello@studio.ru" type="email" />
          <InputRow label="Резервный email" placeholder="backup@studio.ru" type="email" />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={handleSave} style={{
              padding: "9px 22px", borderRadius: "10px",
              background: "var(--peach)", border: "none", color: "white",
              fontSize: "13px", fontWeight: 700, cursor: "pointer",
            }}>
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTeam = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "12px",
              background: "rgba(252,174,145,0.12)", color: "var(--peach)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{icons.users}</div>
            <div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--onyx)" }}>Команда</div>
              <div style={{ fontSize: "12px", color: "var(--muted)" }}>Управляйте сотрудниками и правами</div>
            </div>
          </div>
          <button style={{
            display: "flex", alignItems: "center", gap: "7px",
            padding: "9px 18px", borderRadius: "10px",
            background: "var(--peach)", border: "none", color: "white",
            fontSize: "12px", fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 16px rgba(252,174,145,0.35)",
          }}>
            {icons.plus}
            Добавить сотрудника
          </button>
        </div>

        {[
          { name: "Анна Морозова", role: "Владелец", email: "anna@studio.ru", status: "active" as const },
          { name: "Ирина Смирнова", role: "Администратор", email: "irina@studio.ru", status: "active" as const },
          { name: "Мария Козлова", role: "Тренер", email: "maria@studio.ru", status: "active" as const },
          { name: "Светлана Новикова", role: "Тренер", email: "svetlana@studio.ru", status: "warning" as const },
        ].map((member, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: "14px",
            padding: "14px 16px", borderRadius: "10px",
            transition: "background 0.2s ease",
          }}
            onMouseOver={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.02)"; }}
            onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{
              width: "38px", height: "38px", borderRadius: "12px",
              background: `hsl(${i * 60 + 20}, 60%, 88%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "14px", fontWeight: 800, color: `hsl(${i * 60 + 20}, 40%, 40%)`,
              flexShrink: 0,
            }}>
              {member.name.split(" ").map(w => w[0]).join("")}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{member.name}</div>
              <div style={{ fontSize: "12px", color: "var(--muted)" }}>{member.email}</div>
            </div>
            <StatusBadge type={member.status}>{member.role}</StatusBadge>
            <button className="topbar-ghost" style={{ padding: "6px 12px", fontSize: "11px" }}>Изменить</button>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.key} title="Роли и права" subtitle="Настройте уровни доступа для каждой роли" />
        {[
          { role: "Владелец", desc: "Полный доступ ко всему", color: "#FCAE91" },
          { role: "Администратор", desc: "Управление записями, клиентами, финансами", color: "#A3C9A8" },
          { role: "Тренер", desc: "Расписание и свои клиенты", color: "#9BB5D8" },
        ].map((r, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", borderRadius: "10px",
            background: "rgba(0,0,0,0.015)", marginBottom: "6px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: r.color }} />
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{r.role}</div>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>{r.desc}</div>
              </div>
            </div>
            <button className="topbar-ghost" style={{ padding: "5px 10px", fontSize: "11px" }}>Настроить</button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderBilling = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Current plan hero */}
      <div style={{
        borderRadius: "16px", padding: "32px",
        background: "linear-gradient(135deg, var(--onyx) 0%, #2A2A2A 100%)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: "-60px", right: "-60px",
          width: "220px", height: "220px",
          background: "radial-gradient(circle, rgba(252,174,145,0.2) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "rgba(252,174,145,0.7)", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "8px" }}>Текущий тариф</div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <div style={{ fontSize: "28px", fontWeight: 900, color: "white", letterSpacing: "-1px" }}>Pro</div>
            <StatusBadge type="active">Активен до 15 июля</StatusBadge>
          </div>
          <div style={{ display: "flex", gap: "32px", marginBottom: "20px" }}>
            {[{ v: "∞", l: "клиентов" }, { v: "5", l: "сотрудников" }, { v: "API", l: "доступ" }].map((s, i) => (
              <div key={i}>
                <div style={{ fontSize: "18px", fontWeight: 800, color: "white" }}>{s.v}</div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button style={{
              padding: "9px 20px", borderRadius: "10px",
              background: "var(--peach)", border: "none", color: "white",
              fontSize: "12px", fontWeight: 700, cursor: "pointer",
              boxShadow: "0 4px 16px rgba(252,174,145,0.4)",
            }}>Улучшить до Business</button>
            <button style={{
              padding: "9px 20px", borderRadius: "10px",
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
              color: "rgba(255,255,255,0.65)", fontSize: "12px", fontWeight: 600, cursor: "pointer",
            }}>Управление</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.creditCard} title="Способ оплаты" subtitle="Данные карты для автопродления подписки" />
        <div style={{
          display: "flex", alignItems: "center", gap: "14px",
          padding: "16px", borderRadius: "12px",
          background: "rgba(0,0,0,0.025)", border: "1.5px solid var(--border)",
          marginBottom: "16px",
        }}>
          <div style={{
            width: "44px", height: "30px", borderRadius: "6px",
            background: "linear-gradient(135deg, #1A1A1A, #333)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <div style={{ width: "28px", height: "10px", borderRadius: "2px", background: "rgba(255,200,100,0.5)" }} />
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>•••• •••• •••• 4242</div>
            <div style={{ fontSize: "11px", color: "var(--muted)" }}>Visa · Истекает 08/2027</div>
          </div>
          <StatusBadge type="active">Основная</StatusBadge>
          <button className="topbar-ghost" style={{ marginLeft: "auto", padding: "5px 10px", fontSize: "11px" }}>Заменить</button>
        </div>
        <button style={{
          display: "flex", alignItems: "center", gap: "7px",
          padding: "9px 16px", borderRadius: "10px",
          border: "1.5px dashed var(--border)", background: "transparent",
          color: "var(--muted)", fontSize: "12px", fontWeight: 600, cursor: "pointer",
          transition: "all 0.2s ease", width: "100%", justifyContent: "center",
        }}
          onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--peach)"; e.currentTarget.style.color = "var(--peach)"; }}
          onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)"; }}
        >
          {icons.plus}
          Добавить карту
        </button>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.download} title="История платежей" subtitle="Все транзакции и инвойсы" />
        {[
          { date: "15 июня 2026", amount: "4 990 ₽", plan: "Pro — июль", status: "active" as const },
          { date: "15 мая 2026", amount: "4 990 ₽", plan: "Pro — июнь", status: "active" as const },
          { date: "15 апреля 2026", amount: "4 990 ₽", plan: "Pro — май", status: "active" as const },
        ].map((p, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: "14px",
            padding: "12px 16px", borderRadius: "10px", marginBottom: "4px",
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{p.plan}</div>
              <div style={{ fontSize: "11px", color: "var(--muted)" }}>{p.date}</div>
            </div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--onyx)" }}>{p.amount}</div>
            <StatusBadge type={p.status}>Оплачено</StatusBadge>
            <button style={{
              display: "flex", alignItems: "center", gap: "5px",
              padding: "5px 10px", borderRadius: "7px",
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--muted)", fontSize: "11px", cursor: "pointer",
            }}>{icons.download} PDF</button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSecurity = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.shield} title="Безопасность аккаунта" subtitle="Защитите доступ к вашему рабочему пространству" accent />
        <SecurityIllustration />
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: "10px" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>Двухфакторная аутентификация</div>
              <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "1px" }}>SMS или приложение-аутентификатор</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {!twoFa && <StatusBadge type="warning">Отключена</StatusBadge>}
              {twoFa && <StatusBadge type="active">Активна</StatusBadge>}
              <Toggle checked={twoFa} onChange={() => setTwoFa(!twoFa)} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderRadius: "10px" }}>
            <div>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>Уведомления о входе</div>
              <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "1px" }}>Email при входе с нового устройства</div>
            </div>
            <Toggle checked={sessionAlert} onChange={() => setSessionAlert(!sessionAlert)} />
          </div>
          <SettingsRow label="Изменить пароль" sub="Последнее изменение: 3 месяца назад" onEdit={() => {}} />
          <SettingsRow label="Активные сессии" sub="2 устройства" onEdit={() => {}} tag={<StatusBadge type="info">2 активных</StatusBadge>} />
        </div>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.key} title="API токены" subtitle="Ключи для интеграции внешних сервисов" />
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
          {[
            { name: "Основной API", key: "vel_live_••••4f2a", created: "14 мар 2026" },
            { name: "Telegram Bot", key: "vel_bot_••••9a1c", created: "2 апр 2026" },
          ].map((token, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "12px 14px", borderRadius: "10px",
              background: "rgba(0,0,0,0.02)", border: "1px solid var(--border)",
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--onyx)" }}>{token.name}</div>
                <div style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "monospace" }}>{token.key}</div>
              </div>
              <div style={{ fontSize: "11px", color: "var(--muted)" }}>{token.created}</div>
              <button style={{ color: "#C0607A", background: "rgba(216,140,154,0.1)", border: "none", borderRadius: "6px", padding: "5px 6px", cursor: "pointer" }}>{icons.trash}</button>
            </div>
          ))}
        </div>
        <button style={{
          display: "flex", alignItems: "center", gap: "7px",
          padding: "9px 16px", borderRadius: "10px",
          background: "rgba(252,174,145,0.1)", border: "1px solid rgba(252,174,145,0.3)",
          color: "var(--peach)", fontSize: "12px", fontWeight: 700, cursor: "pointer",
          transition: "all 0.2s ease",
        }}>
          {icons.plus}
          Создать токен
        </button>
      </div>

      {/* Danger zone */}
      <div className="card" style={{ padding: "28px", border: "1.5px solid rgba(216,140,154,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
          <span style={{ color: "#C0607A" }}>{icons.alertTriangle}</span>
          <div style={{ fontSize: "15px", fontWeight: 700, color: "#C0607A" }}>Опасная зона</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <SettingsRow label="Экспорт всех данных" sub="Скачать архив с данными аккаунта" onEdit={() => {}} />
          <SettingsRow label="Удалить все данные" sub="Полная очистка аккаунта — действие необратимо" danger onEdit={() => {}} />
          <SettingsRow label="Удалить аккаунт" sub="Закрыть подписку и удалить компанию" danger onEdit={() => {}} />
        </div>
      </div>
    </div>
  );

  const renderIntegrations = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.link} title="Интеграции" subtitle="Подключите внешние сервисы и каналы" />
        <IntegrationIllustration />
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {[
            { name: "WhatsApp Business", sub: "Рассылки и уведомления клиентам", color: "#25D366", connected: true },
            { name: "Telegram Bot", sub: "Онлайн-запись через бота", color: "#229ED9", connected: true },
            { name: "Instagram Direct", sub: "Входящие сообщения в ленту", color: "#E1306C", connected: false },
            { name: "Google Calendar", sub: "Синхронизация расписания", color: "#4285F4", connected: false },
            { name: "1С: Предприятие", sub: "Выгрузка финансов и справочников", color: "#EF3B2C", connected: false },
            { name: "Яндекс.Касса", sub: "Приём онлайн-платежей", color: "#FFCC00", connected: true },
          ].map((int, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: "14px",
              padding: "14px 16px", borderRadius: "10px",
              border: `1.5px solid ${int.connected ? `${int.color}25` : "var(--border)"}`,
              background: int.connected ? `${int.color}06` : "transparent",
              transition: "all 0.2s ease",
            }}>
              <div style={{
                width: "36px", height: "36px", borderRadius: "10px",
                background: `${int.color}18`, border: `1.5px solid ${int.color}30`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "10px", fontWeight: 900, color: int.color, flexShrink: 0,
              }}>
                {int.name.slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{int.name}</div>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>{int.sub}</div>
              </div>
              {int.connected ? (
                <div style={{ display: "flex", gap: "8px" }}>
                  <StatusBadge type="active">Подключено</StatusBadge>
                  <button className="topbar-ghost" style={{ padding: "5px 10px", fontSize: "11px" }}>Настроить</button>
                </div>
              ) : (
                <button style={{
                  padding: "7px 16px", borderRadius: "8px",
                  background: "transparent", border: `1.5px solid ${int.color}50`,
                  color: int.color, fontSize: "12px", fontWeight: 700, cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                  onMouseOver={(e) => { e.currentTarget.style.background = `${int.color}12`; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  Подключить
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderData = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.database} title="Хранилище данных" subtitle="Управление данными и резервными копиями" />
        <div style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>Использовано места</span>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>2.4 ГБ / 10 ГБ</span>
          </div>
          <div style={{ height: "8px", borderRadius: "100px", background: "var(--border)", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: "24%",
              background: "linear-gradient(90deg, var(--peach), #f07050)",
              borderRadius: "100px",
              transition: "width 0.8s ease",
            }} />
          </div>
          <div style={{ display: "flex", gap: "16px", marginTop: "12px" }}>
            {[
              { label: "Клиенты", size: "0.8 ГБ", color: "var(--peach)" },
              { label: "Фото", size: "1.4 ГБ", color: "#9BB5D8" },
              { label: "Документы", size: "0.2 ГБ", color: "#A3C9A8" },
            ].map((d, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: d.color }} />
                <span style={{ fontSize: "11px", color: "var(--muted)" }}>{d.label}</span>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--onyx)" }}>{d.size}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <SettingsRow label="Автоматический бэкап" sub="Ежедневно в 03:00" onEdit={() => {}} tag={<StatusBadge type="active">Включён</StatusBadge>} />
          <SettingsRow label="Последний бэкап" sub="Сегодня в 03:14 · 124 МБ" onEdit={() => {}} />
          <SettingsRow label="Хранить бэкапы" sub="30 дней" onEdit={() => {}} />
        </div>
        <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
          <button style={{
            display: "flex", alignItems: "center", gap: "7px",
            padding: "9px 18px", borderRadius: "10px",
            background: "rgba(252,174,145,0.1)", border: "1px solid rgba(252,174,145,0.3)",
            color: "var(--peach)", fontSize: "12px", fontWeight: 700, cursor: "pointer",
          }}>
            {icons.download} Скачать бэкап
          </button>
          <button style={{
            display: "flex", alignItems: "center", gap: "7px",
            padding: "9px 18px", borderRadius: "10px",
            border: "1px solid var(--border)", background: "transparent",
            color: "var(--muted)", fontSize: "12px", fontWeight: 600, cursor: "pointer",
          }}>
            {icons.zap} Создать сейчас
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.download} title="Экспорт данных" subtitle="Выгрузите нужные данные в удобном формате" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          {[
            { name: "Список клиентов", format: "CSV / XLSX" },
            { name: "История записей", format: "CSV / PDF" },
            { name: "Финансовый отчёт", format: "XLSX / PDF" },
            { name: "Аналитика", format: "PDF" },
          ].map((e, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px", borderRadius: "10px",
              border: "1.5px solid var(--border)", background: "rgba(0,0,0,0.01)",
            }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--onyx)" }}>{e.name}</div>
                <div style={{ fontSize: "11px", color: "var(--muted)" }}>{e.format}</div>
              </div>
              <button style={{
                display: "flex", alignItems: "center", gap: "4px",
                padding: "6px 10px", borderRadius: "7px",
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--muted)", fontSize: "11px", cursor: "pointer",
                transition: "all 0.2s ease",
              }}
                onMouseOver={(e) => { e.currentTarget.style.color = "var(--peach)"; e.currentTarget.style.borderColor = "rgba(252,174,145,0.4)"; }}
                onMouseOut={(e) => { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                {icons.download}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const sectionRenderers: Record<string, () => React.ReactNode> = {
    general: renderGeneral,
    hours: renderHours,
    appearance: renderAppearance,
    notifications: renderNotifications,
    team: renderTeam,
    billing: renderBilling,
    security: renderSecurity,
    integrations: renderIntegrations,
    data: renderData,
  };

  return (
    <>
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .settings-content-anim {
          animation: fadeSlideIn 0.3s ease forwards;
        }
      `}</style>

      <div style={{ display: "flex", gap: "0", height: "100%", minHeight: "calc(100vh - 60px)" }}>
        {/* ─── LEFT NAV ─── */}
        <aside style={{
          width: "220px",
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          padding: "24px 12px",
          position: "sticky",
          top: "0",
          height: "fit-content",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
        }}>
          <div style={{
            fontSize: "10px", fontWeight: 700, letterSpacing: "1.5px",
            textTransform: "uppercase", color: "var(--muted)", padding: "4px 14px 10px",
          }}>
            Настройки
          </div>

          {navItems.map(item => (
            <NavItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={activeSection === item.id}
              onClick={() => setActiveSection(item.id)}
              badge={(item as any).badge}
            />
          ))}

          <div style={{ marginTop: "auto", paddingTop: "20px", borderTop: "1px solid var(--border)", marginLeft: "-12px", marginRight: "-12px", padding: "16px 12px 0" }}>
            <button style={{
              display: "flex", alignItems: "center", gap: "10px",
              width: "100%", padding: "10px 14px", borderRadius: "10px",
              background: "transparent", border: "none",
              color: "#C0607A", fontSize: "13px", fontWeight: 600, cursor: "pointer",
              transition: "background 0.18s ease", textAlign: "left",
            }}
              onMouseOver={(e) => { e.currentTarget.style.background = "rgba(216,140,154,0.1)"; }}
              onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              {icons.logout}
              Выйти из аккаунта
            </button>
          </div>
        </aside>

        {/* ─── CONTENT ─── */}
        <div
          ref={contentRef}
          style={{
            flex: 1,
            padding: "28px 32px",
            overflowY: "auto",
            maxWidth: "820px",
          }}
        >
          <div
            key={activeSection}
            className="settings-content-anim"
            style={{ display: "flex", flexDirection: "column", gap: "0" }}
          >
            {(sectionRenderers[activeSection] || renderGeneral)()}
          </div>
        </div>
      </div>
    </>
  );
}