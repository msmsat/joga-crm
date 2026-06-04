import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../App.css"; // Обязательный импорт глобальных стилей
import { Orbs, Logo, InputField, IdentifierTabs, type IdentifierMode, PrimaryBtn,
   Divider, Checkbox, SocialProof, PasswordStrength, ErrorAlert, PhoneField } from "../components/UI";
import { isValidPhoneNumber } from "react-phone-number-input";
import { GoogleLogin } from '@react-oauth/google';

// ─── MAIN LOGIN PAGE ──────────────────────────────────────────────────────────
export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [identifierMode, setIdentifierMode] = useState<IdentifierMode>("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [errors, setErrors] = useState<{ identifier?: string; password?: string; resetCode?: string }>({});

  const [submitError, setSubmitError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // 🔥 Новые стейты для восстановления пароля
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    setTimeout(() => setMounted(true), 50);
  }, []);

  const handleGoogleSuccess = async (credential: string) => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8000/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: credential }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail);
      
      localStorage.setItem("token", data.access_token);
      navigate("/dashboard");
    } catch (err: any) {
      setSubmitError("Ошибка авторизации через Google");
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors: { identifier?: string; password?: string } = {};
    if (!identifier.trim()) {
      const labels = { email: "Email", phone: "Телефон" }; // Убрали name
      newErrors.identifier = `${labels[identifierMode]} обязателен`;
    } else if (identifierMode === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
      newErrors.identifier = "Введите корректный email";
    } else if (identifierMode === "phone" && !isValidPhoneNumber(identifier)) {
      // 🔥 Заменили Regex на умную функцию от библиотеки
      newErrors.identifier = "Введите номер телефона полностью";
    }
    if (mode !== "forgot" && !password) {
      newErrors.password = "Пароль обязателен";
    } else if (mode !== "forgot" && password.length < 6) {
      newErrors.password = "Минимум 6 символов";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setLoading(true);
    setSubmitError(""); 
    setSuccessMsg("");

    try {
      // ── ФЛОУ: ОТПРАВКА КОДА ВОССТАНОВЛЕНИЯ (ШАГ 1) ──
      if (mode === "forgot" && forgotStep === 1) {
        const response = await fetch("http://localhost:8000/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: identifier }),
        });
        if (!response.ok) throw new Error("Не удалось отправить код");
        setForgotStep(2); // Переходим на шаг 2 (ввод кода)
      } 
      
      // ── ФЛОУ: СОХРАНЕНИЕ НОВОГО ПАРОЛЯ (ШАГ 2) ──
      else if (mode === "forgot" && forgotStep === 2) {
        const response = await fetch("http://localhost:8000/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: identifier, code: resetCode, new_password: newPassword }),
        });
        const data = await response.json();
        if (!response.ok) {
           if (Array.isArray(data.detail)) throw new Error(`Ошибка: ${data.detail[0].msg}`);
           throw new Error(data.detail || "Неверный код");
        }
        // Пароль изменен! Возвращаем на страницу логина
        setMode("login");
        setForgotStep(1);
        setPassword("");
        setSuccessMsg("Пароль успешно изменен! Теперь вы можете войти.");
      } 
      
      // ── ФЛОУ: ОБЫЧНЫЙ ЛОГИН ──
      else {
        const response = await fetch("http://localhost:8000/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier: identifier, password: password }),
        });

        const data = await response.json();
        if (!response.ok) {
          if (Array.isArray(data.detail)) throw new Error(`Ошибка: ${data.detail[0].loc[1]} - ${data.detail[0].msg}`);
          throw new Error(data.detail || "Ошибка входа");
        }
        localStorage.setItem("token", data.access_token);
        navigate("/dashboard");
      }
    } catch (err: any) {
      setSubmitError(err.message || "Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
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
  };

  const titles = {
    login: "С возвращением",
    register: "Создать аккаунт",
    forgot: forgotStep === 1 ? "Восстановить доступ" : "Придумайте пароль",
  };

  const subtitles = {
    login: "Войдите, чтобы продолжить работу в Velora",
    register: "14 дней бесплатно — без карты",
    forgot: forgotStep === 1 ? "Мы пришлём инструкцию на ваш email" : `Код отправлен на ${identifier}`,
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
                onClick={() => navigate("/register")} // 🔥 Просто делаем переход вместо setMode
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
                  onClick={() => { 
                    if (forgotStep === 2) setForgotStep(1);
                    else { setMode("login"); setForgotStep(1); }
                    setErrors({}); setSubmitError("");
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: "var(--muted)", fontSize: "12px", fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: "8px", width: "fit-content" }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
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
                <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>  
                  <GoogleLogin
                      width="320"
                      onSuccess={(credentialResponse) => {
                          if (credentialResponse.credential) {
                          handleGoogleSuccess(credentialResponse.credential);
                          }
                      }}
                      onError={() => {
                          setSubmitError("Google авторизация не удалась");
                      }}
                      useOneTap 
                  />
                </div>
                <Divider label="или войдите через" />
              </>
            )}

            {/* Identifier Tabs */}
            {mode !== "forgot" && (
              <IdentifierTabs active={identifierMode} onChange={(m) => { setIdentifierMode(m); setIdentifier(""); setErrors({}); }} />
            )}

            {/* Form Fields */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

              {/* 🔥 ДОБАВИТЬ ЭТОТ БЛОК НИЖЕ */}
              <ErrorAlert message={submitError} />

              {successMsg && (
                <div style={{ padding: "12px 16px", background: "#E8F5E9", border: "1px solid #A5D6A7", borderRadius: "10px", color: "#2E7D32", fontSize: "13px", fontWeight: 600 }}>
                  {successMsg}
                </div>
              )}

              {/* Если режим восстановления пароля ИЛИ вкладка email — показываем обычный InputField */}
              {(mode !== "forgot" || (mode === "forgot" && forgotStep === 1)) && (
                identifierMode === "email" || mode === "forgot" ? (
                  <InputField
                    label="Email"
                    type="email"
                    placeholder="you@example.com"
                    value={identifier}
                    onChange={(v: string) => { setIdentifier(v); setErrors((e) => ({ ...e, identifier: undefined })); }}
                    icon={icons.email}
                    error={errors.identifier}
                  />
                ) : (
                  <PhoneField
                    label="Номер телефона"
                    value={identifier}
                    onChange={(v: string) => { setIdentifier(v || ""); setErrors((e) => ({ ...e, identifier: undefined })); }}
                    error={errors.identifier}
                  />
                )
              )}

              {/* Password Field */}
              {mode === "forgot" && forgotStep === 2 && (
                <>
                  <InputField 
                    label="Код из письма" type="text" placeholder="1234" maxLength={4} 
                    value={resetCode} 
                    onChange={(v: string) => { setResetCode(v.replace(/\D/g, '')); setErrors((e) => ({ ...e, resetCode: undefined })); }} 
                    icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5.5 7V5C5.5 3.61929 6.61929 2.5 8 2.5C9.38071 2.5 10.5 3.61929 10.5 5V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="8" cy="10.5" r="1" fill="currentColor"/></svg>} 
                    error={errors.resetCode} 
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <InputField 
                      label="Новый пароль" type={showPassword ? "text" : "password"} placeholder="Минимум 8 символов" 
                      value={newPassword} 
                      onChange={(v: string) => { setNewPassword(v); setErrors((e) => ({ ...e, password: undefined })); }} 
                      icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5.5 7V5C5.5 3.61929 6.61929 2.5 8 2.5C9.38071 2.5 10.5 3.61929 10.5 5V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="8" cy="10.5" r="1" fill="currentColor"/></svg>} 
                      rightSlot={<button onClick={() => setShowPassword(!showPassword)} style={{ background: "none", border: "none", cursor: "pointer", color: showPassword ? "var(--peach)" : "var(--muted)", padding: 0, height: "100%", outline: "none" }}>{showPassword ? "Скрыть" : "Показать"}</button>} 
                      error={errors.password} 
                    />
                    <PasswordStrength password={newPassword} />
                  </div>
                </>
              )}

              {mode === "login" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <InputField
                    label="Пароль"
                    type={showPassword ? "text" : "password"}
                    placeholder="Введите пароль"
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
                        {showPassword ? "Скрыть" : "Показать"}
                      </button>
                    }
                    error={errors.password}
                  />
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