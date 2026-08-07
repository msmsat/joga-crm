import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../App.css"; // Обязательный импорт глобальных стилей
import { Orbs, Logo, InputField, IdentifierTabs, type IdentifierMode, PrimaryBtn,
   Divider, Checkbox, SocialProof, PasswordStrength, ErrorAlert, PhoneField } from "../components/UI";
import { isValidPhoneNumber } from "react-phone-number-input";
import { GoogleLogin } from '@react-oauth/google';
import { authApi, ApiError } from '../api';
import { setActiveToken } from '../utils/auth';

// ─── MAIN LOGIN PAGE ──────────────────────────────────────────────────────────
export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "login2fa">("login");
  // ?email=… — возврат в аккаунт из «Недавних» в профиле: адрес подставляем,
  // пароль спрашиваем как обычно (живого токена у прежнего аккаунта уже нет).
  const [searchParams] = useSearchParams();
  const [identifierMode, setIdentifierMode] = useState<IdentifierMode>("email");
  const [identifier, setIdentifier] = useState(() => searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [errors, setErrors] = useState<{ identifier?: string; password?: string; resetCode?: string; twoFaCode?: string }>({});

  const [submitError, setSubmitError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // 🔥 Новые стейты для восстановления пароля
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // 2FA при входе (EPIC 5, задача 5) — identifier/password уже введены и
  // проверены на шаге "login", здесь только код из письма.
  const [twoFaCode, setTwoFaCode] = useState("");

  useEffect(() => {
    setTimeout(() => setMounted(true), 50);
  }, []);

  const handleGoogleSuccess = async (credential: string) => {
    setLoading(true);
    try {
      const data = await authApi.google({ token: credential });
      if (data.two_fa_required) {
        setIdentifier(data.two_fa_identifier ?? "");
        setTwoFaCode("");
        setMode("login2fa");
      } else if (data.access_token) {
        setActiveToken(data.access_token);
        navigate("/dashboard");
      }
    } catch {
      setSubmitError("Ошибка авторизации через Google");
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const newErrors: { identifier?: string; password?: string; twoFaCode?: string } = {};
    if (mode === "login2fa") {
      if (!/^\d{6}$/.test(twoFaCode)) newErrors.twoFaCode = "Введите 6 цифр из письма";
      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    }
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
        await authApi.forgotPassword({ email: identifier });
        setForgotStep(2);
      }

      // ── ФЛОУ: СОХРАНЕНИЕ НОВОГО ПАРОЛЯ (ШАГ 2) ──
      else if (mode === "forgot" && forgotStep === 2) {
        const data = await authApi.resetPassword({ email: identifier, code: resetCode, new_password: newPassword });
        // Код с почты — то же подтверждение личности, что и пароль: бэкенд сразу
        // отдаёт токен, и вводить свежесозданный пароль ещё раз незачем.
        if (data.access_token) {
          setActiveToken(data.access_token);
          navigate("/dashboard");
        } else {
          // Токена нет — у аккаунта не нашлось активной студии. Вход обычный.
          setMode("login");
          setForgotStep(1);
          setPassword("");
          setSuccessMsg("Пароль успешно изменён! Теперь вы можете войти.");
        }
      }

      // ── ФЛОУ: ПОДТВЕРЖДЕНИЕ КОДА 2FA (ШАГ 2 ВХОДА) ──
      else if (mode === "login2fa") {
        const data = await authApi.login2fa({ identifier, code: twoFaCode });
        if (data.access_token) setActiveToken(data.access_token);
        navigate("/dashboard");
      }

      // ── ФЛОУ: ОБЫЧНЫЙ ЛОГИН ──
      else {
        const data = await authApi.login({ identifier, password });
        if (data.two_fa_required) {
          setMode("login2fa");
          setTwoFaCode("");
        } else if (data.access_token) {
          setActiveToken(data.access_token);
          navigate("/dashboard");
        }
      }
    } catch (err: unknown) {
      setSubmitError(err instanceof ApiError ? err.message : "Ошибка соединения с сервером");
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
    login2fa: "Код подтверждения",
  };

  const subtitles = {
    login: "Войдите, чтобы продолжить работу в Velora",
    register: "14 дней бесплатно — без карты",
    forgot: forgotStep === 1 ? "Мы пришлём инструкцию на ваш email" : `Код отправлен на ${identifier}`,
    login2fa: `Код отправлен на ${identifier}`,
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
              {(mode === "forgot" || mode === "login2fa") && (
                <button
                  onClick={() => {
                    if (mode === "login2fa") { setMode("login"); setTwoFaCode(""); }
                    else if (forgotStep === 2) setForgotStep(1);
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

            {/* Google Auth (not for forgot/login2fa) */}
            {mode !== "forgot" && mode !== "login2fa" && (
              <>
                <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>  
                  <GoogleLogin
                      /* Ширина кнопки Google — жёсткий пиксель внутри iframe:
                         320 не влезает в карточку на 320px-экране и вылезает
                         за край. Считаем один раз при монтировании — поворот
                         экрана в форме входа переживём. */
                      width={String(Math.min(320, window.innerWidth - 76))}
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
            {mode !== "forgot" && mode !== "login2fa" && (
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
              {mode !== "login2fa" && (mode !== "forgot" || (mode === "forgot" && forgotStep === 1)) && (
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
                    onChange={(v) => { setIdentifier(v || ""); setErrors((e) => ({ ...e, identifier: undefined })); }}
                    error={errors.identifier}
                  />
                )
              )}

              {/* Password Field */}
              {mode === "forgot" && forgotStep === 2 && (
                <>
                  <InputField 
                    label="Код из письма" type="text" placeholder="123456" maxLength={6}
                    value={resetCode}
                    onChange={(v: string) => { setResetCode(v.replace(/\D/g, '').slice(0, 6)); setErrors((e) => ({ ...e, resetCode: undefined })); }}
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

              {mode === "login2fa" && (
                <InputField
                  label="Код из письма"
                  type="text"
                  placeholder="123456"
                  maxLength={6}
                  value={twoFaCode}
                  onChange={(v: string) => { setTwoFaCode(v.replace(/\D/g, '').slice(0, 6)); setErrors((e) => ({ ...e, twoFaCode: undefined })); }}
                  icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5.5 7V5C5.5 3.61929 6.61929 2.5 8 2.5C9.38071 2.5 10.5 3.61929 10.5 5V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="8" cy="10.5" r="1" fill="currentColor"/></svg>}
                  error={errors.twoFaCode}
                />
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
                : mode === "login2fa"
                ? "Подтвердить"
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