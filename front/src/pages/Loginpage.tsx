import { useState, useEffect } from "react";
import "../App.css"; // Обязательный импорт глобальных стилей
import { Orbs, Logo, InputField, IdentifierTabs, type IdentifierMode, GoogleBtn, PrimaryBtn, Divider, Checkbox, SocialProof, PasswordStrength } from "../components/UI";

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
    <div className="page-wrapper">
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
        <div style={{ fontSize: "13px", color: "var(--muted)", display: "flex", alignItems: "center", gap: "6px" }}>
          {mode === "login" ? (
            <>
              Нет аккаунта?{" "}
              <button
                onClick={() => { setMode("register"); setErrors({}); }}
                style={{
                  background: "none", border: "none", color: "var(--peach)",
                  fontWeight: 700, fontSize: "13px", cursor: "pointer", padding: 0,
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
                  background: "none", border: "none", color: "var(--peach)",
                  fontWeight: 700, fontSize: "13px", cursor: "pointer", padding: 0,
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
          <div className="login-card">
            {/* Header */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {mode === "forgot" && (
                <button
                  onClick={() => { setMode("login"); setErrors({}); }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "6px",
                    background: "none", border: "none", color: "var(--muted)",
                    fontSize: "12px", fontWeight: 600, cursor: "pointer",
                    padding: 0, marginBottom: "8px", width: "fit-content",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Назад
                </button>
              )}
              <h1 style={{ fontSize: "26px", fontWeight: 900, color: "var(--onyx)", letterSpacing: "-0.8px", margin: 0, lineHeight: "1.1" }}>
                {titles[mode]}
              </h1>
              <p style={{ fontSize: "14px", color: "var(--muted)", margin: 0, fontWeight: 400, lineHeight: "1.5" }}>
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
                onChange={(v: string) => { setIdentifier(v); setErrors((e) => ({ ...e, identifier: undefined })); }}
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
                    onChange={(v: string) => { setPassword(v); setErrors((e) => ({ ...e, password: undefined })); }}
                    icon={
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <rect x="3" y="7" width="10" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M5.5 7V5C5.5 3.61929 6.61929 2.5 8 2.5C9.38071 2.5 10.5 3.61929 10.5 5V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                        <circle cx="8" cy="10.5" r="1" fill="currentColor" />
                      </svg>
                    }
                    rightSlot={
                      <button
                        onClick={() => setShowPassword((v: boolean) => !v)}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: showPassword ? "var(--peach)" : "var(--muted)",
                          padding: 0, height: "100%", display: "flex", 
                          alignItems: "center", justifyContent: "center", 
                          transition: "color 0.2s", outline: "none"
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Checkbox checked={remember} onChange={setRemember} label="Запомнить меня" />
                <button
                  onClick={() => { setMode("forgot"); setErrors({}); }}
                  style={{
                    background: "none", border: "none", color: "var(--peach)",
                    fontSize: "13px", fontWeight: 600, cursor: "pointer", padding: 0, textDecoration: "none",
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
              <p style={{ fontSize: "12px", color: "var(--muted)", margin: 0, textAlign: "center", lineHeight: "1.6" }}>
                Письмо придёт в течение нескольких минут. Проверьте папку&nbsp;
                <span style={{ color: "var(--onyx)", fontWeight: 600 }}>Спам</span>, если не нашли.
              </p>
            )}
          </div>

          {/* ── BELOW CARD ── */}
          <div style={{ marginTop: "28px", display: "flex", flexDirection: "column", gap: "20px", alignItems: "center" }}>
            {/* Social proof */}
            <SocialProof />

            {/* Security badge */}
            <div style={{ display: "flex", alignItems: "center", gap: "20px", justifyContent: "center" }}>
              {[
                {
                  icon: (
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M6.5 1L1.5 3V6.5C1.5 9.26142 3.73858 11.5 6.5 12C9.26142 11.5 11.5 9.26142 11.5 6.5V3L6.5 1Z" stroke="var(--pistachio)" strokeWidth="1.3" strokeLinejoin="round" />
                      <path d="M4.5 6.5L5.9 7.9L8.5 5" stroke="var(--pistachio)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ),
                  label: "SSL защита",
                },
                {
                  icon: (
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <rect x="1.5" y="1.5" width="10" height="10" rx="2" stroke="var(--pistachio)" strokeWidth="1.3" />
                      <path d="M4 6.5H9M6.5 4V9" stroke="var(--pistachio)" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                  ),
                  label: "GDPR соответствие",
                },
                {
                  icon: (
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <circle cx="6.5" cy="6.5" r="5" stroke="var(--pistachio)" strokeWidth="1.3" />
                      <path d="M4 6.5L5.8 8.3L9 5" stroke="var(--pistachio)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ),
                  label: "2FA опционально",
                },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 500, color: "rgba(102,102,102,0.7)" }}>
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
          borderTop: `1px solid var(--border)`, padding: "16px 40px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "relative", zIndex: 1, flexWrap: "wrap", gap: "8px",
        }}
      >
        <div style={{ fontSize: "12px", color: "rgba(102,102,102,0.5)" }}>
          © 2026 Velora. Все права защищены.
        </div>
        <div style={{ display: "flex", gap: "20px", fontSize: "12px" }}>
          {["Конфиденциальность", "Условия", "Поддержка"].map((l) => (
            <a key={l} href="#" style={{ color: "rgba(102,102,102,0.6)", textDecoration: "none", transition: "color 0.2s" }} onMouseOver={(e) => e.currentTarget.style.color = "var(--onyx)"} onMouseOut={(e) => e.currentTarget.style.color = "rgba(102,102,102,0.6)"}>
              {l}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}