import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

// ─── DESIGN TOKENS (exact match from Landingpage.tsx) ─────────────────────────
const tokens = {
  peach: "#F9A08B",
  peachLight: "#FCAE91",
  peachGlow: "rgba(249,160,139,0.18)",
  bg: "#FDFCFB",
  bgCard: "#FFFFFF",
  onyx: "#1A1A1A",
  muted: "#666666",
  border: "rgba(26,26,26,0.08)",
  pistachio: "#A3C9A8",
  rose: "#D88C9A",
  shadow: "0 8px 40px -8px rgba(26,26,26,0.10)",
  shadowHover: "0 20px 60px -12px rgba(249,160,139,0.22)",
};

// ─── FLOATING ORBS ────────────────────────────────────────────────────────────
function Orbs() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-80px",
          right: "-100px",
          width: "560px",
          height: "560px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(249,160,139,0.15) 0%, transparent 70%)",
          animation: "float1 14s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "0",
          left: "-120px",
          width: "440px",
          height: "440px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(163,201,168,0.10) 0%, transparent 70%)",
          animation: "float2 18s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "40%",
          left: "30%",
          width: "280px",
          height: "280px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(249,160,139,0.07) 0%, transparent 60%)",
          animation: "float3 22s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes float1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-30px,20px) scale(1.04)} }
        @keyframes float2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(20px,-30px) scale(1.06)} }
        @keyframes float3 { 0%,100%{transform:translate(0,0)} 33%{transform:translate(-15px,15px)} 66%{transform:translate(15px,-10px)} }
        @keyframes pulse { 0%,100%{opacity:1;box-shadow:0 0 0 3px rgba(249,160,139,0.18)} 50%{opacity:.8;box-shadow:0 0 0 6px rgba(249,160,139,0.06)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes checkPop { 0%{transform:scale(0)} 60%{transform:scale(1.2)} 100%{transform:scale(1)} }
        @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}

// ─── LOGO ─────────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "10px",
          background: `linear-gradient(135deg, ${tokens.peachLight} 0%, ${tokens.peach} 100%)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 4px 14px ${tokens.peachGlow}`,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="3" y="3" width="6" height="6" rx="2" fill="white" opacity="0.95" />
          <rect x="11" y="3" width="6" height="6" rx="2" fill="white" opacity="0.6" />
          <rect x="3" y="11" width="6" height="6" rx="2" fill="white" opacity="0.6" />
          <rect x="11" y="11" width="6" height="6" rx="2" fill="white" opacity="0.95" />
        </svg>
      </div>
      <span
        style={{
          fontFamily: "'Manrope', sans-serif",
          fontWeight: 800,
          fontSize: "19px",
          letterSpacing: "-0.4px",
          color: tokens.onyx,
        }}
      >
        Velora<span style={{ color: tokens.peach }}>.</span>
      </span>
    </div>
  );
}

// ─── INPUT FIELD ──────────────────────────────────────────────────────────────
function InputField({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  icon,
  rightSlot,
  error,
}: {
  label: string;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  icon?: React.ReactNode;
  rightSlot?: React.ReactNode;
  error?: string;
}) {
  const [focused, setFocused] = useState(false);
  const hasValue = value.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <label
        style={{
          fontFamily: "'Manrope', sans-serif",
          fontSize: "13px",
          fontWeight: 600,
          color: focused ? tokens.onyx : tokens.muted,
          transition: "color 0.2s",
          letterSpacing: "0.1px",
        }}
      >
        {label}
      </label>
      <div style={{ position: "relative" }}>
        {/* Left icon */}
        {icon && (
          <div
            style={{
              position: "absolute",
              left: "14px",
              top: "50%",
              transform: "translateY(-50%)",
              color: focused ? tokens.peach : tokens.muted,
              transition: "color 0.2s",
              display: "flex",
              alignItems: "center",
              pointerEvents: "none",
            }}
          >
            {icon}
          </div>
        )}
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: "100%",
            padding: icon ? "14px 14px 14px 44px" : "14px 44px 14px 16px",
            paddingRight: rightSlot ? "48px" : "16px",
            background: focused
              ? tokens.bgCard
              : hasValue
              ? tokens.bgCard
              : "rgba(26,26,26,0.025)",
            border: `1.5px solid ${
              error
                ? tokens.rose
                : focused
                ? tokens.peach
                : hasValue
                ? "rgba(26,26,26,0.14)"
                : tokens.border
            }`,
            borderRadius: "12px",
            fontFamily: "'Manrope', sans-serif",
            fontSize: "15px",
            fontWeight: 500,
            color: tokens.onyx,
            outline: "none",
            boxShadow: focused
              ? error
                ? `0 0 0 4px rgba(216,140,154,0.14)`
                : `0 0 0 4px rgba(249,160,139,0.12)`
              : "none",
            transition: "all 0.22s ease",
            boxSizing: "border-box",
          }}
        />
        {/* Right slot (e.g. show password) */}
        {rightSlot && (
          <div
            style={{
              position: "absolute",
              right: "14px",
              top: "50%",
              transform: "translateY(-50%)",
              display: "flex",
              alignItems: "center",
            }}
          >
            {rightSlot}
          </div>
        )}
      </div>
      {error && (
        <p
          style={{
            fontFamily: "'Manrope', sans-serif",
            fontSize: "12px",
            color: tokens.rose,
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5.5" stroke={tokens.rose} />
            <path d="M6 3.5V6.5" stroke={tokens.rose} strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="6" cy="8.5" r="0.75" fill={tokens.rose} />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

// ─── IDENTIFIER TABS ──────────────────────────────────────────────────────────
type IdentifierMode = "email" | "phone" | "name";

function IdentifierTabs({
  active,
  onChange,
}: {
  active: IdentifierMode;
  onChange: (m: IdentifierMode) => void;
}) {
  const tabs: { key: IdentifierMode; label: string }[] = [
    { key: "email", label: "Email" },
    { key: "phone", label: "Телефон" },
    { key: "name", label: "Имя" },
  ];

  return (
    <div
      style={{
        display: "flex",
        background: "rgba(26,26,26,0.04)",
        borderRadius: "10px",
        padding: "3px",
        gap: "2px",
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            flex: 1,
            padding: "8px 12px",
            border: "none",
            borderRadius: "8px",
            fontFamily: "'Manrope', sans-serif",
            fontSize: "13px",
            fontWeight: active === t.key ? 700 : 500,
            color: active === t.key ? tokens.onyx : tokens.muted,
            background:
              active === t.key
                ? tokens.bgCard
                : "transparent",
            boxShadow:
              active === t.key
                ? "0 1px 6px rgba(26,26,26,0.08)"
                : "none",
            cursor: "pointer",
            transition: "all 0.2s ease",
            letterSpacing: "0.1px",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── GOOGLE AUTH BUTTON ───────────────────────────────────────────────────────
function GoogleBtn({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "100%",
        padding: "13px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
        background: hov ? "rgba(26,26,26,0.04)" : tokens.bgCard,
        border: `1.5px solid ${hov ? "rgba(26,26,26,0.16)" : tokens.border}`,
        borderRadius: "12px",
        fontFamily: "'Manrope', sans-serif",
        fontSize: "14px",
        fontWeight: 600,
        color: tokens.onyx,
        cursor: "pointer",
        transform: hov ? "translateY(-1px)" : "none",
        boxShadow: hov ? tokens.shadow : "none",
        transition: "all 0.22s ease",
        letterSpacing: "0.1px",
      }}
    >
      {/* Google G logo */}
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M17.64 9.2045C17.64 8.5663 17.5827 7.9527 17.4764 7.3636H9V10.845H13.8436C13.635 11.97 13.0009 12.9231 12.0477 13.5613V15.8195H14.9564C16.6582 14.2527 17.64 11.9454 17.64 9.2045Z" fill="#4285F4"/>
        <path d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65591 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z" fill="#34A853"/>
        <path d="M3.96409 10.71C3.78409 10.17 3.68182 9.5931 3.68182 9C3.68182 8.4068 3.78409 7.8299 3.96409 7.2899V4.9581H0.957275C0.347727 6.1731 0 7.5477 0 9C0 10.4522 0.347727 11.8268 0.957275 13.0418L3.96409 10.71Z" fill="#FBBC05"/>
        <path d="M9 3.5795C10.3214 3.5795 11.5077 4.0336 12.4405 4.9254L15.0218 2.344C13.4632 0.8918 11.4259 0 9 0C5.48182 0 2.43818 2.0168 0.957275 4.9581L3.96409 7.2899C4.67182 5.1627 6.65591 3.5795 9 3.5795Z" fill="#EA4335"/>
      </svg>
      Войти через Google
    </button>
  );
}

// ─── PRIMARY BUTTON ───────────────────────────────────────────────────────────
function PrimaryBtn({
  children,
  onClick,
  loading = false,
  fullWidth = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  loading?: boolean;
  fullWidth?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      disabled={loading}
      style={{
        width: fullWidth ? "100%" : "auto",
        padding: "15px 28px",
        background: loading
          ? `linear-gradient(135deg, ${tokens.peachLight}, ${tokens.peach})`
          : hov
          ? `linear-gradient(135deg, #FCAE91 0%, #F9A08B 100%)`
          : `linear-gradient(135deg, ${tokens.peach} 0%, #F5866E 100%)`,
        border: "none",
        borderRadius: "12px",
        fontFamily: "'Manrope', sans-serif",
        fontWeight: 700,
        fontSize: "15px",
        color: "#fff",
        cursor: loading ? "not-allowed" : "pointer",
        boxShadow: hov && !loading
          ? `0 12px 40px -8px rgba(249,160,139,0.52), 0 2px 8px rgba(249,160,139,0.2)`
          : `0 4px 20px -4px rgba(249,160,139,0.38)`,
        transform: hov && !loading ? "translateY(-2px) scale(1.01)" : "none",
        transition: "all 0.25s cubic-bezier(0.34,1.56,0.64,1)",
        letterSpacing: "0.1px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        opacity: loading ? 0.85 : 1,
      }}
    >
      {loading ? (
        <>
          <span
            style={{
              width: "16px",
              height: "16px",
              border: "2px solid rgba(255,255,255,0.4)",
              borderTopColor: "white",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              display: "inline-block",
            }}
          />
          Входим...
        </>
      ) : (
        children
      )}
    </button>
  );
}

// ─── DIVIDER ──────────────────────────────────────────────────────────────────
function Divider({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        margin: "4px 0",
      }}
    >
      <div
        style={{
          flex: 1,
          height: "1px",
          background: tokens.border,
        }}
      />
      <span
        style={{
          fontFamily: "'Manrope', sans-serif",
          fontSize: "12px",
          fontWeight: 500,
          color: "rgba(102,102,102,0.7)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: "1px",
          background: tokens.border,
        }}
      />
    </div>
  );
}

// ─── CHECKBOX ─────────────────────────────────────────────────────────────────
function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: "18px",
          height: "18px",
          borderRadius: "5px",
          border: `1.5px solid ${checked ? tokens.peach : "rgba(26,26,26,0.2)"}`,
          background: checked
            ? `linear-gradient(135deg, ${tokens.peachLight}, ${tokens.peach})`
            : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.2s ease",
          boxShadow: checked ? `0 2px 8px ${tokens.peachGlow}` : "none",
          flexShrink: 0,
        }}
      >
        {checked && (
          <svg
            width="10"
            height="8"
            viewBox="0 0 10 8"
            fill="none"
            style={{ animation: "checkPop 0.22s ease" }}
          >
            <path
              d="M1 4L3.5 6.5L9 1"
              stroke="white"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <span
        style={{
          fontFamily: "'Manrope', sans-serif",
          fontSize: "13px",
          fontWeight: 500,
          color: tokens.muted,
        }}
      >
        {label}
      </span>
    </label>
  );
}

// ─── SOCIAL PROOF STRIP ───────────────────────────────────────────────────────
function SocialProof() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex" }}>
        {["🧖", "💇", "🏋️", "💅", "✂️"].map((e, i) => (
          <div
            key={i}
            style={{
              width: "26px",
              height: "26px",
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${tokens.peachLight}80, ${tokens.peach}80)`,
              border: "1.5px solid white",
              marginLeft: i > 0 ? "-6px" : "0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "11px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
            }}
          >
            {e}
          </div>
        ))}
      </div>
      <p
        style={{
          fontFamily: "'Manrope', sans-serif",
          fontSize: "12px",
          color: tokens.muted,
          margin: 0,
        }}
      >
        <strong style={{ color: tokens.onyx, fontWeight: 700 }}>2 400+</strong>{" "}
        бизнесов уже в системе
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "3px",
          padding: "3px 8px",
          background: "rgba(163,201,168,0.12)",
          borderRadius: "100px",
          border: "1px solid rgba(163,201,168,0.28)",
        }}
      >
        <span style={{ color: tokens.pistachio, fontSize: "10px" }}>★</span>
        <span
          style={{
            fontWeight: 700,
            fontSize: "11px",
            color: tokens.onyx,
            fontFamily: "'Manrope', sans-serif",
          }}
        >
          4.9
        </span>
      </div>
    </div>
  );
}

// ─── PASSWORD STRENGTH ────────────────────────────────────────────────────────
function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;

  const strength = (() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  })();

  const levels = [
    { label: "Слабый", color: tokens.rose },
    { label: "Слабый", color: tokens.rose },
    { label: "Средний", color: "#F9C08B" },
    { label: "Хороший", color: tokens.pistachio },
    { label: "Сильный", color: "#6DB87A" },
    { label: "Отличный", color: "#4CAF62" },
  ];

  const level = levels[Math.min(strength, 5)];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", gap: "4px" }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: "3px",
              borderRadius: "2px",
              background:
                i <= strength
                  ? level.color
                  : "rgba(26,26,26,0.08)",
              transition: "background 0.3s ease",
            }}
          />
        ))}
      </div>
      <p
        style={{
          fontFamily: "'Manrope', sans-serif",
          fontSize: "11px",
          fontWeight: 600,
          color: level.color,
          margin: 0,
          transition: "color 0.3s ease",
        }}
      >
        {level.label}
      </p>
    </div>
  );
}

// ─── MAIN LOGIN PAGE ──────────────────────────────────────────────────────────
export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [identifierMode, setIdentifierMode] = useState<IdentifierMode>("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});

  useEffect(() => {
    setTimeout(() => setMounted(true), 50);
  }, []);

  const validateForm = () => {
    const newErrors: { identifier?: string; password?: string } = {};
    if (!identifier.trim()) {
      const labels = { email: "Email", phone: "Телефон", name: "Имя" };
      newErrors.identifier = `${labels[identifierMode]} обязателен`;
    } else if (identifierMode === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
      newErrors.identifier = "Введите корректный email";
    } else if (identifierMode === "phone" && !/^\+?[0-9\s\-()]{7,}$/.test(identifier)) {
      newErrors.identifier = "Введите корректный номер";
    }
    if (mode !== "forgot" && !password) {
      newErrors.password = "Пароль обязателен";
    } else if (mode !== "forgot" && password.length < 6) {
      newErrors.password = "Минимум 6 символов";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;
    setLoading(true);
    setTimeout(() => setLoading(false), 2200);
  };

  const placeholders: Record<IdentifierMode, string> = {
    email: "you@example.com",
    phone: "+7 (999) 000-00-00",
    name: "Ваше имя",
  };

  const icons: Record<IdentifierMode, React.ReactNode> = {
    email: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="3.5" width="13" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path d="M1.5 5.5L8 9.5L14.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
    phone: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="4" y="1.5" width="8" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="8" cy="12.5" r="0.75" fill="currentColor" />
        <path d="M6.5 3.5H9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
    name: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.4" />
        <path d="M2 13.5C2 11.0147 4.68629 9 8 9C11.3137 9 14 11.0147 14 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  };

  const titles = {
    login: "С возвращением",
    register: "Создать аккаунт",
    forgot: "Восстановить доступ",
  };

  const subtitles = {
    login: "Войдите, чтобы продолжить работу в Velora",
    register: "14 дней бесплатно — без карты",
    forgot: "Мы пришлём инструкцию на ваш email",
  };

  return (
    <>
      <link
        rel="preconnect"
        href="https://fonts.googleapis.com"
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800;900&display=swap"
      />

      <div
        style={{
          minHeight: "100vh",
          background: tokens.bg,
          display: "flex",
          flexDirection: "column",
          fontFamily: "'Manrope', sans-serif",
          position: "relative",
        }}
      >
        <Orbs />

        {/* ── TOP NAV ── */}
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 40px",
            position: "relative",
            zIndex: 10,
            opacity: mounted ? 1 : 0,
            transition: "opacity 0.4s ease",
          }}
        >
          <Logo />
          <div
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: "13px",
              color: tokens.muted,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {mode === "login" ? (
              <>
                Нет аккаунта?{" "}
                <button
                  onClick={() => { setMode("register"); setErrors({}); }}
                  style={{
                    background: "none",
                    border: "none",
                    color: tokens.peach,
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: "pointer",
                    fontFamily: "'Manrope', sans-serif",
                    padding: 0,
                  }}
                >
                  Зарегистрироваться →
                </button>
              </>
            ) : (
              <>
                Уже есть аккаунт?{" "}
                <button
                  onClick={() => { setMode("login"); setErrors({}); }}
                  style={{
                    background: "none",
                    border: "none",
                    color: tokens.peach,
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: "pointer",
                    fontFamily: "'Manrope', sans-serif",
                    padding: 0,
                  }}
                >
                  Войти →
                </button>
              </>
            )}
          </div>
        </nav>

        {/* ── MAIN CONTENT ── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px 24px 60px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "440px",
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(24px)",
              transition: "all 0.55s cubic-bezier(0.34,1.1,0.64,1) 0.1s",
            }}
          >
            {/* ── CARD ── */}
            <div
              style={{
                background: tokens.bgCard,
                borderRadius: "24px",
                border: `1px solid ${tokens.border}`,
                boxShadow:
                  "0 8px 48px -8px rgba(26,26,26,0.10), 0 2px 8px rgba(26,26,26,0.04)",
                padding: "40px",
                display: "flex",
                flexDirection: "column",
                gap: "24px",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {mode === "forgot" && (
                  <button
                    onClick={() => { setMode("login"); setErrors({}); }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "none",
                      border: "none",
                      color: tokens.muted,
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: 0,
                      marginBottom: "8px",
                      fontFamily: "'Manrope', sans-serif",
                      width: "fit-content",
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Назад
                  </button>
                )}
                <h1
                  style={{
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: "26px",
                    fontWeight: 900,
                    color: tokens.onyx,
                    letterSpacing: "-0.8px",
                    margin: 0,
                    lineHeight: "1.1",
                  }}
                >
                  {titles[mode]}
                </h1>
                <p
                  style={{
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: "14px",
                    color: tokens.muted,
                    margin: 0,
                    fontWeight: 400,
                    lineHeight: "1.5",
                  }}
                >
                  {subtitles[mode]}
                </p>
              </div>

              {/* Google Auth (not for forgot) */}
              {mode !== "forgot" && (
                <>
                  <GoogleBtn onClick={() => {}} />
                  <Divider label="или войдите через" />
                </>
              )}

              {/* Identifier Tabs */}
              {mode !== "forgot" && (
                <IdentifierTabs active={identifierMode} onChange={(m) => { setIdentifierMode(m); setIdentifier(""); setErrors({}); }} />
              )}

              {/* Form Fields */}
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Identifier Input */}
                <InputField
                  label={
                    mode === "forgot"
                      ? "Email"
                      : identifierMode === "email"
                      ? "Email"
                      : identifierMode === "phone"
                      ? "Номер телефона"
                      : "Имя пользователя"
                  }
                  type={
                    mode === "forgot"
                      ? "email"
                      : identifierMode === "email"
                      ? "email"
                      : identifierMode === "phone"
                      ? "tel"
                      : "text"
                  }
                  placeholder={mode === "forgot" ? "you@example.com" : placeholders[identifierMode]}
                  value={identifier}
                  onChange={(v) => { setIdentifier(v); setErrors((e) => ({ ...e, identifier: undefined })); }}
                  icon={mode === "forgot" ? icons.email : icons[identifierMode]}
                  error={errors.identifier}
                />

                {/* Password Field */}
                {mode !== "forgot" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <InputField
                      label="Пароль"
                      type={showPassword ? "text" : "password"}
                      placeholder={mode === "register" ? "Минимум 8 символов" : "Введите пароль"}
                      value={password}
                      onChange={(v) => { setPassword(v); setErrors((e) => ({ ...e, password: undefined })); }}
                      icon={
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <rect x="3" y="7" width="10" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.4" />
                          <path d="M5.5 7V5C5.5 3.61929 6.61929 2.5 8 2.5C9.38071 2.5 10.5 3.61929 10.5 5V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                          <circle cx="8" cy="10.5" r="1" fill="currentColor" />
                        </svg>
                      }
                      rightSlot={
                        <button
                          onClick={() => setShowPassword((v) => !v)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: showPassword ? tokens.peach : tokens.muted,
                            padding: 0,
                            display: "flex",
                            alignItems: "center",
                            transition: "color 0.2s",
                          }}
                        >
                          {showPassword ? (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <path d="M2 8C2 8 4 3 8 3C12 3 14 8 14 8C14 8 12 13 8 13C4 13 2 8 2 8Z" stroke="currentColor" strokeWidth="1.4" />
                              <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
                              <path d="M2 2L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                            </svg>
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                              <path d="M2 8C2 8 4 3 8 3C12 3 14 8 14 8C14 8 12 13 8 13C4 13 2 8 2 8Z" stroke="currentColor" strokeWidth="1.4" />
                              <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
                            </svg>
                          )}
                        </button>
                      }
                      error={errors.password}
                    />
                    {mode === "register" && <PasswordStrength password={password} />}
                  </div>
                )}
              </div>

              {/* Remember + Forgot */}
              {mode === "login" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Checkbox
                    checked={remember}
                    onChange={setRemember}
                    label="Запомнить меня"
                  />
                  <button
                    onClick={() => { setMode("forgot"); setErrors({}); }}
                    style={{
                      background: "none",
                      border: "none",
                      color: tokens.peach,
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "'Manrope', sans-serif",
                      padding: 0,
                      textDecoration: "none",
                    }}
                  >
                    Забыли пароль?
                  </button>
                </div>
              )}

              {/* Register: Terms checkbox */}
              {mode === "register" && (
                <Checkbox
                  checked={remember}
                  onChange={setRemember}
                  label="Я соглашаюсь с условиями использования и политикой конфиденциальности"
                />
              )}

              {/* CTA Button */}
              <PrimaryBtn onClick={handleSubmit} loading={loading} fullWidth>
                {mode === "login"
                  ? "Войти в систему"
                  : mode === "register"
                  ? "Создать аккаунт"
                  : "Отправить инструкцию"}
              </PrimaryBtn>

              {/* Forgot mode hint */}
              {mode === "forgot" && (
                <p
                  style={{
                    fontFamily: "'Manrope', sans-serif",
                    fontSize: "12px",
                    color: tokens.muted,
                    margin: 0,
                    textAlign: "center",
                    lineHeight: "1.6",
                  }}
                >
                  Письмо придёт в течение нескольких минут. Проверьте папку&nbsp;
                  <span style={{ color: tokens.onyx, fontWeight: 600 }}>Спам</span>, если не нашли.
                </p>
              )}
            </div>

            {/* ── BELOW CARD ── */}
            <div
              style={{
                marginTop: "28px",
                display: "flex",
                flexDirection: "column",
                gap: "20px",
                alignItems: "center",
              }}
            >
              {/* Social proof */}
              <SocialProof />

              {/* Security badge */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "20px",
                  justifyContent: "center",
                }}
              >
                {[
                  {
                    icon: (
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path
                          d="M6.5 1L1.5 3V6.5C1.5 9.26142 3.73858 11.5 6.5 12C9.26142 11.5 11.5 9.26142 11.5 6.5V3L6.5 1Z"
                          stroke={tokens.pistachio}
                          strokeWidth="1.3"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M4.5 6.5L5.9 7.9L8.5 5"
                          stroke={tokens.pistachio}
                          strokeWidth="1.3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ),
                    label: "SSL защита",
                  },
                  {
                    icon: (
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <rect
                          x="1.5"
                          y="1.5"
                          width="10"
                          height="10"
                          rx="2"
                          stroke={tokens.pistachio}
                          strokeWidth="1.3"
                        />
                        <path
                          d="M4 6.5H9M6.5 4V9"
                          stroke={tokens.pistachio}
                          strokeWidth="1.3"
                          strokeLinecap="round"
                        />
                      </svg>
                    ),
                    label: "GDPR соответствие",
                  },
                  {
                    icon: (
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <circle cx="6.5" cy="6.5" r="5" stroke={tokens.pistachio} strokeWidth="1.3" />
                        <path
                          d="M4 6.5L5.8 8.3L9 5"
                          stroke={tokens.pistachio}
                          strokeWidth="1.3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ),
                    label: "2FA опционально",
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      fontFamily: "'Manrope', sans-serif",
                      fontSize: "11px",
                      fontWeight: 500,
                      color: "rgba(102,102,102,0.7)",
                    }}
                  >
                    {item.icon}
                    {item.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <footer
          style={{
            borderTop: `1px solid ${tokens.border}`,
            padding: "16px 40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
            zIndex: 1,
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          <div
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: "12px",
              color: "rgba(102,102,102,0.5)",
            }}
          >
            © 2026 Velora. Все права защищены.
          </div>
          <div
            style={{
              display: "flex",
              gap: "20px",
              fontFamily: "'Manrope', sans-serif",
              fontSize: "12px",
            }}
          >
            {["Конфиденциальность", "Условия", "Поддержка"].map((l) => (
              <a
                key={l}
                href="#"
                style={{ color: "rgba(102,102,102,0.6)", textDecoration: "none" }}
              >
                {l}
              </a>
            ))}
          </div>
        </footer>

        {/* ── MOBILE RESPONSIVE STYLES ── */}
        <style>{`
          @media (max-width: 480px) {
            nav { padding: 16px 20px !important; }
            footer { padding: 14px 20px !important; }
            .login-card { padding: 28px 24px !important; }
          }
        `}</style>
      </div>
    </>
  );
}