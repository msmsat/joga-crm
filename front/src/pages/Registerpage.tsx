import { useState, useEffect } from "react";
import "../App.css";
import { 
  Orbs, Logo, InputField, PasswordStrength, StepDots, 
  IconEmail, IconUser, IconLock, IconEyeOpen, IconEyeClosed, ErrorAlert
} from "../components/UI"; // 🔥 Весь UI подтягивается отсюда
import { useNavigate } from "react-router-dom";
import { GoogleLogin } from '@react-oauth/google';

// ─── STEP TYPES ──────────────────────────────────────────────────────────────

type Step = 0 | 1 | 2 | 3 | 4;

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function RegisterPage() {
  const [step, setStep] = useState<Step>(0);
  const [mounted, setMounted] = useState(false);
  const navigate = useNavigate();

  // Fields
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agree, setAgree] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);

  const clearErr = (key: string) => setErrors((e) => { const n = { ...e }; delete n[key]; return n; });

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

  const validateStep = (s: Step): boolean => {
    const errs: Record<string, string> = {};
    if (s === 1) {
      if (!email.trim()) errs.email = "Введите email";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Некорректный email";
    }
    if (s === 2) {
      if (!displayName.trim()) errs.displayName = "Введите имя или никнейм";
      else if (displayName.trim().length < 2) errs.displayName = "Минимум 2 символа";
    }
    if (s === 3) {
      if (!password) errs.password = "Введите пароль";
      else if (password.length < 8) errs.password = "Минимум 8 символов";
      if (!agree) errs.agree = "Необходимо согласие";
    }
    if (s === 4) {
      if (!code) errs.code = "Введите код подтверждения";
      else if (code.length !== 4) errs.code = "Код должен состоять из 4 цифр";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => {
    if (!validateStep(step)) return;
    setStep((s) => (s + 1) as Step);
  };

  // 🔥 1. Отправка данных на регистрацию
  const handleRegister = async () => {
    if (!validateStep(3)) return;
    setLoading(true);
    setSubmitError(""); 

    try {
      const response = await fetch("http://localhost:8000/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email,
          display_name: displayName, 
          password: password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Не удалось зарегистрироваться");
      }

      // Если успешно — сервер НЕ дал токен, а отправил код. Переходим на Шаг 4.
      setStep(4);

    } catch (err: any) {
      setSubmitError(err.message || "Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!validateStep(4)) return;
    setLoading(true);
    setSubmitError(""); 

    try {
      const response = await fetch("http://localhost:8000/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email,
          code: code,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Неверный код подтверждения");
      }

      // 🎉 УСПЕХ: Код подошел, мы получили токен!
      localStorage.setItem("token", data.access_token);
      setDone(true); // Показываем экран "Добро пожаловать"

    } catch (err: any) {
      setSubmitError(err.message || "Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  };

  const totalSteps = 4;
  const progressStep = step === 0 ? 0 : step - 1;

  // ── ICONS ──
  const eyeIcon = (open: boolean) => open 
    ? <IconEyeOpen />
    : <IconEyeClosed />;

  const stepMeta = [
    { title: "", sub: "" },
    // 🔥 Поменяли тут:
    { title: "Контактные данные", sub: "Введите ваш email для создания аккаунта" },
    { title: "Как вас называть?", sub: "Имя или никнейм — на ваш выбор" },
    { title: "Придумайте пароль", sub: "Минимум 8 символов для надёжной защиты" },
    { title: "Подтверждение почты", sub: "Мы отправили 4-значный код на ваш email" },
  ];
  
  return (
    <div className="page-wrapper">
      <Orbs />

      {/* ── NAV ── */}
      <nav className="flex-between" style={{ padding: "20px 40px", position: "relative", zIndex: 10, opacity: mounted ? 1 : 0, transition: "opacity 0.4s ease" }}>
        <Logo />
        <div className="text-muted" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          Уже есть аккаунт?{" "}
          <button onClick={() => navigate("/login")} style={{ background: "none", border: "none", color: "var(--peach)", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
            Войти →
          </button>
        </div>
      </nav>

      {/* ── MAIN ── */}
      <div className="flex-center" style={{ flex: 1, padding: "20px 24px 40px", position: "relative", zIndex: 1 }}>
        <div style={{ width: "100%", maxWidth: 420, opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(24px)", transition: "all 0.6s cubic-bezier(0.34,1.2,0.64,1)" }}>

          {/* ── CARD ── */}
          <div className="login-card flex-col gap-24" style={{ background: "var(--bg-card)", borderRadius: 24, border: "1px solid var(--border)", boxShadow: "0 8px 48px -8px rgba(26,26,26,0.10), 0 2px 8px rgba(26,26,26,0.04)", padding: 40 }}>

            {done ? (
              /* ── SUCCESS STATE ── */
              <div className="flex-col flex-center" style={{ gap: 20, padding: "8px 0", textAlign: "center" }}>
                <div className="flex-center" style={{ width: 64, height: 64, borderRadius: 20, background: "linear-gradient(135deg, rgba(163,201,168,0.15), rgba(163,201,168,0.08))", border: "1.5px solid rgba(163,201,168,0.30)" }}>
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M6 14L11 19L22 9" stroke="var(--pistachio)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div className="flex-col gap-8">
                  <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: "-0.4px" }}>Добро пожаловать, {displayName}!</div>
                  <div className="text-muted" style={{ fontSize: 14, lineHeight: "1.6" }}>Аккаунт создан. Мы отправили письмо на <span style={{ color: "var(--onyx)", fontWeight: 600 }}>{email}</span> для подтверждения.</div>
                </div>
                <button className="btn-gradient" onClick={() => navigate("/dashboard")}>
                  Перейти в панель управления →
                </button>
              </div>
            ) : step === 0 ? (
              /* ── STEP 0: METHOD PICKER ── */
              <div className="step-enter flex-col gap-24">
                <div className="flex-col gap-8">
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", background: "linear-gradient(135deg, rgba(249,160,139,0.12), rgba(249,160,139,0.06))", border: "1px solid rgba(249,160,139,0.28)", borderRadius: 100, width: "fit-content" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--peach)", boxShadow: "0 0 0 3px var(--peach-glow)", animation: "pulse 2.4s ease-in-out infinite" }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--peach)", letterSpacing: "0.3px" }}>14 дней бесплатно</span>
                  </div>
                  <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1.2 }}>Создать аккаунт</h1>
                  <p className="text-muted" style={{ fontSize: 14, lineHeight: "1.6" }}>Без карты. Без обязательств. Только результат.</p>
                </div>

                <GoogleLogin
                    onSuccess={(credentialResponse) => {
                        if (credentialResponse.credential) {
                        handleGoogleSuccess(credentialResponse.credential);
                        }
                    }}
                    onError={() => {
                        setSubmitError("Google авторизация не удалась");
                    }}
                    useOneTap // Опционально: показывает красивое всплывающее окно справа сверху
                />

                <div className="flex-center gap-12">
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(102,102,102,0.5)", textTransform: "uppercase" }}>или</span>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>

                <button className="btn-gradient" onClick={() => setStep(1)}>
                  {<IconEmail />} Зарегистрироваться по email
                </button>

                <p style={{ fontSize: 12, color: "rgba(102,102,102,0.55)", textAlign: "center", lineHeight: "1.6", margin: 0 }}>
                  Регистрируясь, вы принимаете <a href="#" className="text-link">Условия использования</a> и <a href="#" className="text-link">Политику конфиденциальности</a>
                </p>
              </div>
            ) : (
              /* ── STEPS 1–3 ── */
              <div className="step-enter flex-col gap-24">
                <div className="flex-col gap-16">
                  <StepDots current={progressStep} total={totalSteps} />
                  <div className="flex-col" style={{ gap: 6 }}>
                    <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.4px" }}>{stepMeta[step].title}</h2>
                    <p className="text-muted" style={{ fontSize: 13, lineHeight: "1.5" }}>{stepMeta[step].sub}</p>
                  </div>
                </div>

                <div className="flex-col gap-16">
                  {step === 1 && (
                    <>
                      <InputField label="Email *" type="email" placeholder="you@example.com" value={email} onChange={(v: string) => { setEmail(v); clearErr("email"); }} icon={<IconEmail />} error={errors.email} autoComplete="email" />
                    </>
                  )}
                  {step === 2 && (
                    <InputField label="Имя или никнейм *" type="text" placeholder="Например: Катя, Max, КрутойМаркетолог" value={displayName} onChange={(v: string) => { setDisplayName(v); clearErr("displayName"); }} icon={<IconUser />} error={errors.displayName} autoComplete="nickname" />
                  )}
                  {step === 3 && (
                    <div className="flex-col gap-8">
                      <InputField
                        label="Пароль *" type={showPassword ? "text" : "password"} placeholder="Минимум 8 символов"
                        value={password} onChange={(v: string) => { setPassword(v); clearErr("password"); }}
                        icon={<IconLock />} error={errors.password} autoComplete="new-password"
                        rightSlot={<button className="btn-icon-clear" style={{ color: showPassword ? "var(--peach)" : "var(--muted)" }} onClick={() => setShowPassword((v) => !v)}>{eyeIcon(showPassword)}</button>}
                      />
                      <PasswordStrength password={password} />
                    </div>
                  )}
                  {step === 4 && (
                    <div className="flex-col gap-8">
                      <InputField
                        label="Код из письма" type="text" placeholder="1234" maxLength={4}
                        value={code} 
                        onChange={(v: string) => { 
                          // Разрешаем вводить только цифры
                          setCode(v.replace(/\D/g, '')); 
                          clearErr("code"); 
                        }}
                        icon={<IconLock />} error={errors.code} 
                      />
                    </div>
                  )}
                  <ErrorAlert message={submitError} />
                </div>

                {step === 2 && (
                  <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "rgba(249,160,139,0.06)", borderRadius: 12, border: "1px solid rgba(249,160,139,0.14)" }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="8" cy="8" r="6.5" stroke="var(--peach)" strokeWidth="1.3" /><path d="M8 5.5V8.5" stroke="var(--peach)" strokeWidth="1.3" strokeLinecap="round" /><circle cx="8" cy="10.5" r="0.6" fill="var(--peach)" /></svg>
                    <span className="text-muted" style={{ fontSize: 12, lineHeight: "1.6" }}>Это имя будет отображаться в интерфейсе и уведомлениях. Вы сможете изменить его в настройках.</span>
                  </div>
                )}

                {step === 3 && (
                  <div className="flex-col" style={{ gap: 4 }}>
                    <label className="custom-checkbox-wrapper">
                      <input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); clearErr("agree"); }} style={{ display: "none" }} />
                      <div className="custom-checkbox-box" style={{ border: `1.5px solid ${agree ? "var(--peach)" : "rgba(26,26,26,0.2)"}`, background: agree ? "linear-gradient(135deg, var(--peach-light), var(--peach))" : "transparent", boxShadow: agree ? "0 2px 8px var(--peach-glow)" : "none" }}>
                        {agree && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ animation: "checkPop 0.22s ease" }}><path d="M2 5L4.2 7.2L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </div>
                      <span className="text-muted" style={{ fontSize: 12, lineHeight: "1.6" }}>Я принимаю <a href="#" className="text-link">Условия использования</a> и <a href="#" className="text-link">Политику конфиденциальности</a></span>
                    </label>
                    {errors.agree && <span style={{ fontSize: 12, color: "var(--rose)", fontWeight: 500, marginLeft: 28 }}>{errors.agree}</span>}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  {/* Кнопку "Назад" прячем на 4 шаге, чтобы юзер не отправил дубль */}
                  {step < 4 && (
                    <button className="btn-back" onClick={() => setStep((s) => (s - 1) as Step)}>←</button>
                  )}
                  
                  <button 
                    className="btn-gradient" 
                    onClick={step === 3 ? handleRegister : step === 4 ? handleVerify : next} 
                    disabled={loading} 
                    style={{ flex: 1 }}
                  >
                    {loading ? <><span className="spinner" /> Загрузка...</> : step === 3 ? "Зарегистрироваться" : step === 4 ? "Подтвердить →" : "Продолжить →"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── BELOW CARD ── */}
          {!done && (
            <div className="flex-col flex-center" style={{ marginTop: 24, gap: 16 }}>
              <div className="flex-center gap-10">
                <div style={{ display: "flex" }}>
                  {["#F9A08B","#A3C9A8","#D88C9A","#7EB8D4","#B8A9D9"].map((c, i) => (
                    <div key={i} className="flex-center" style={{ width: 26, height: 26, borderRadius: "50%", background: `linear-gradient(135deg, ${c}, ${c}cc)`, border: "2px solid var(--bg-card)", marginLeft: i > 0 ? -8 : 0, zIndex: 5 - i, fontSize: 10, fontWeight: 700, color: "white" }}>
                      {["К","А","М","Д","В"][i]}
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: 12, color: "rgba(102,102,102,0.6)", fontWeight: 500 }}><b style={{ color: "var(--onyx)" }}>2 400+</b> бизнесов уже работают с Velora</span>
              </div>
              <div className="flex-center" style={{ gap: 20 }}>
                {[ { label: "SSL защита" }, { label: "GDPR" }, { label: "2FA" } ].map((item, i) => (
                  <div key={i} className="flex-center" style={{ gap: 5, fontSize: 11, fontWeight: 500, color: "rgba(102,102,102,0.6)" }}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1L1.5 3V6.5C1.5 9.26142 3.73858 11.5 6.5 12C9.26142 11.5 11.5 9.26142 11.5 6.5V3L6.5 1Z" stroke="var(--pistachio)" strokeWidth="1.3" strokeLinejoin="round" /><path d="M4.5 6.5L5.9 7.9L8.5 5" stroke="var(--pistachio)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    {item.label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="flex-between" style={{ borderTop: "1px solid var(--border)", padding: "16px 40px", position: "relative", zIndex: 1, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 12, color: "rgba(102,102,102,0.5)" }}>© 2026 Velora. Все права защищены.</div>
        <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
          {["Конфиденциальность", "Условия", "Поддержка"].map((l) => (
            <a key={l} href="#" className="text-muted" style={{ textDecoration: "none", transition: "color 0.2s" }} onMouseOver={(e) => (e.currentTarget.style.color = "var(--onyx)")} onMouseOut={(e) => (e.currentTarget.style.color = "var(--muted)")}>{l}</a>
          ))}
        </div>
      </footer>
    </div>
  );
}