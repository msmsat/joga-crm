import { useState, useEffect } from "react";
import "../App.css";
import {
  Orbs, Logo, InputField, PasswordStrength, StepDots,
  IconEmail, IconUser, IconLock, PasswordEye, ErrorAlert
} from "../components/UI"; // 🔥 Весь UI подтягивается отсюда
import { useNavigate } from "react-router-dom";
import { GoogleSignIn } from '../components/cookies/GoogleSignIn';
import { openCookieSettings } from '../utils/cookieConsent';
import { authApi, ApiError } from '../api';
import { setActiveToken } from '../utils/auth';
import { legalFooterLinks, LEGAL_LINK_PROPS, PRIVACY_URL, TERMS_URL } from '../utils/legal';
import { getAnonId } from "../lib/anonId";
import { submitOnEnter } from "../lib/submitOnEnter";
import { useTranslation } from 'react-i18next';

// ─── STEP TYPES ──────────────────────────────────────────────────────────────
//
// Шагов четыре, и первый — сразу поле email. Экрана выбора способа («кнопка
// Google, разделитель ИЛИ, кнопка „Зарегистрироваться по email“») больше нет:
// он спрашивал «как вы хотите начать» вместо того, чтобы дать начать. Поле
// стоит первым, Google — под ним, оба видны сразу.
type Step = 1 | 2 | 3 | 4;

// ─── CONSENT ─────────────────────────────────────────────────────────────────

/** Clickwrap-галочка: одно согласие покрывает Условия (вместе с приложением об
 *  обработке данных) и Политику — у документов общая редакция.
 *
 *  Стоит ОДИН раз — на первом шаге, рядом с полем email, и покрывает оба пути
 *  сразу: и регистрацию по почте, и Google (та кнопка до галочки не срабатывает
 *  и отправляет сюда). Мелкий текст «регистрируясь, вы принимаете» под кнопкой
 *  был бы browsewrap — доказательства согласия он не даёт, а через Google
 *  приходит половина людей. */
function ConsentCheck({ checked, error, onChange }: { checked: boolean; error?: string; onChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex-col" style={{ gap: 4 }}>
      <label className="custom-checkbox-wrapper">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ display: "none" }} />
        <div className="custom-checkbox-box" style={{ border: `1.5px solid ${checked ? "var(--peach)" : "rgba(var(--ink),0.2)"}`, background: checked ? "linear-gradient(135deg, var(--peach-light), var(--peach))" : "transparent", boxShadow: checked ? "0 2px 8px var(--peach-glow)" : "none" }}>
          {checked && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ animation: "checkPop 0.22s ease" }}><path d="M2 5L4.2 7.2L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </div>
        <span className="text-muted" style={{ fontSize: 12, lineHeight: "1.6" }}>
          {t("join:consent.text")} <a href={TERMS_URL} {...LEGAL_LINK_PROPS} className="text-link">{t("join:consent.terms")}</a> {" "}
          {t("join:consent.and")} <a href={PRIVACY_URL} {...LEGAL_LINK_PROPS} className="text-link">{t("join:consent.privacy")}</a>
        </span>
      </label>
      {error && <span style={{ fontSize: 12, color: "var(--rose)", fontWeight: 500, marginLeft: 28 }}>{error}</span>}
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function RegisterPage() {
  const { t } = useTranslation();
  const footerLinks = legalFooterLinks(t);
  const [step, setStep] = useState<Step>(1);
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
    // Клик по кнопке до галочки перехватывает прозрачная кнопка поверх неё
    // (см. разметку), но One Tap всплывает сам, мимо кнопки, — поэтому проверка
    // нужна и здесь. Ошибка показывается у самой галочки.
    if (!agree) {
      setErrors((e) => ({ ...e, agree: t("join:errors.consentRequired") }));
      return;
    }
    setLoading(true);
    try {
      const data = await authApi.google({ token: credential, accept_terms: true });
      if (data.two_fa_required) {
        // Google-аккаунт привязан к существующему владельцу с 2FA — код уже
        // отправлен, дошагать до ввода кода умеет страница входа.
        navigate("/login");
      } else if (data.access_token) {
        setActiveToken(data.access_token);
        navigate("/dashboard");
      }
    } catch {
      setSubmitError(t("auth.googleFailed"));
    } finally {
      setLoading(false);
    }
  };

  const validateStep = (s: Step): boolean => {
    const errs: Record<string, string> = {};
    if (s === 1) {
      if (!email.trim()) errs.email = t("validation.required");
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = t("validation.email");
      // Согласие спрашиваем ОДИН раз и здесь же: оно разблокирует кнопку
      // Google на этом экране, и второй раз на шаге пароля не нужно.
      if (!agree) errs.agree = t("join:errors.consentRequired");
    }
    if (s === 2) {
      if (!displayName.trim()) errs.displayName = t("validation.required");
      else if (displayName.trim().length < 2) errs.displayName = t("validation.minLength", { n: 2 });
    }
    if (s === 3) {
      if (!password) errs.password = t("join:errors.passwordRequired");
      else if (password.length < 8) errs.password = t("validation.minLength", { n: 8 });
      // Согласия здесь НЕ проверяем: галочка осталась на первом шаге, и ошибке
      // про неё тут не под чем появиться — человек увидел бы молчащую кнопку.
      // Без галочки до этого шага не доходят, а если бы дошли — откажет сервер
      // (accept_terms), и отказ будет видно в ErrorAlert.
    }
    if (s === 4) {
      if (!code) errs.code = t("auth.confirmationCode");
      else if (code.length !== 6) errs.code = t("auth.codeSix");
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
      await authApi.register({ email, name: displayName, password, accept_terms: agree, anon_id: getAnonId() });
      setStep(4);
    } catch (err: unknown) {
      setSubmitError(err instanceof ApiError ? err.message : t("errors.network"));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!validateStep(4)) return;
    setLoading(true);
    setSubmitError("");

    try {
      const data = await authApi.verifyEmail({ email, code });
      if (data.access_token) setActiveToken(data.access_token);
      setDone(true);
    } catch (err: unknown) {
      setSubmitError(err instanceof ApiError ? err.message : t("errors.network"));
    } finally {
      setLoading(false);
    }
  };

  const totalSteps = 4;
  const progressStep = step - 1;

  const stepMeta = [
    { title: "", sub: "" },
    // 🔥 Поменяли тут:
    { title: t("onboarding:steps.contact.title"), sub: t("auth.contactSub") },
    { title: t("auth.nameTitle"), sub: t("auth.nameSub") },
    { title: t("auth.choosePassword"), sub: t("validation.minLength", { n: 8 }) },
    { title: t("auth.confirmationCode"), sub: t("auth.codeSent", { identifier: email }) },
  ];
  
  return (
    <div className="page-wrapper">
      <Orbs />

      {/* ── NAV ── */}
      <nav className="flex-between" style={{ padding: "20px 40px", position: "relative", zIndex: 10, opacity: mounted ? 1 : 0, transition: "opacity 0.4s ease" }}>
        <Logo />
        {/* «Назад» — на лендинг, как и на странице входа: сюда приходят по
            прямой ссылке, и history.back() уводил бы куда угодно. Ссылка «Уже
            есть аккаунт? Войти» из шапки уехала вниз, в тёмную плашку — к
            остальным дверям. */}
        <button
          onClick={() => navigate("/")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "9px 16px 9px 13px", borderRadius: 10,
            background: "transparent", border: "1.5px solid var(--border)",
            color: "var(--muted)", fontFamily: "var(--font)",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            transition: "border-color 0.2s, color 0.2s",
          }}
          onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--peach)"; e.currentTarget.style.color = "var(--onyx)"; }}
          onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--muted)"; }}
        >
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M7.5 2L3.5 6L7.5 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("buttons.back")}
        </button>
      </nav>

      {/* ── MAIN ── */}
      <div className="flex-center" style={{ flex: 1, padding: "20px 24px 40px", position: "relative", zIndex: 1 }}>
        <div style={{ width: "100%", maxWidth: 420, opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(24px)", transition: "all 0.6s cubic-bezier(0.34,1.2,0.64,1)" }}>

          {/* ── CARD ── */}
          <div
            className="login-card flex-col gap-24"
            onKeyDown={submitOnEnter(loading ? null : (step === 3 ? handleRegister : step === 4 ? handleVerify : next))}
            style={{ background: "var(--bg-card)", borderRadius: 24, border: "1px solid var(--border)", boxShadow: "0 8px 48px -8px rgba(26,26,26,0.10), 0 2px 8px rgba(26,26,26,0.04)", padding: "var(--auth-card-pad, 40px)" }}>

            {done ? (
              /* ── SUCCESS STATE ── */
              <div className="flex-col flex-center" style={{ gap: 20, padding: "8px 0", textAlign: "center" }}>
                <div className="flex-center" style={{ width: 64, height: 64, borderRadius: 20, background: "linear-gradient(135deg, rgba(163,201,168,0.15), rgba(163,201,168,0.08))", border: "1.5px solid rgba(163,201,168,0.30)" }}>
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M6 14L11 19L22 9" stroke="var(--pistachio)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div className="flex-col gap-8">
                  <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: "-0.4px" }}>{t("onboarding:identity.welcome")}, {displayName}!</div>
                  <div className="text-muted" style={{ fontSize: 14, lineHeight: "1.6" }}>{t("auth.accountCreated", { email })}</div>
                </div>
                <button className="btn-gradient" onClick={() => navigate("/dashboard")}>
                  {t("auth.dashboard")} →
                </button>
              </div>
            ) : (
              /* ── ШАГИ 1–4: email + согласие → имя → пароль → код ── */
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
                      <ConsentCheck checked={agree} error={errors.agree} onChange={(v) => { setAgree(v); clearErr("agree"); }} />
                    </>
                  )}
                  {step === 2 && (
                    <InputField label={`${t("auth.nameTitle")} *`} type="text" placeholder={t("auth.displayNamePlaceholder")} value={displayName} onChange={(v: string) => { setDisplayName(v); clearErr("displayName"); }} icon={<IconUser />} error={errors.displayName} autoComplete="nickname" />
                  )}
                  {step === 3 && (
                    <div className="flex-col gap-8">
                      <InputField
                        label={`${t("join:fields.password")} *`} type={showPassword ? "text" : "password"} placeholder={t("validation.minLength", { n: 8 })}
                        value={password} onChange={(v: string) => { setPassword(v); clearErr("password"); }}
                        icon={<IconLock />} error={errors.password} autoComplete="new-password"
                        rightSlot={<PasswordEye shown={showPassword} onToggle={() => setShowPassword(v => !v)} />}
                      />
                      <PasswordStrength password={password} />
                    </div>
                  )}
                  {step === 4 && (
                    <div className="flex-col gap-8">
                      <InputField
                        label={t("auth.codeFromEmail")} type="text" placeholder="123456" maxLength={6}
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
                    <span className="text-muted" style={{ fontSize: 12, lineHeight: "1.6" }}>{t("auth.displayNameHint")}</span>
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  {/* «Назад» нет на первом шаге (отступать некуда — из шапки
                      уводит кнопка на лендинг) и на четвёртом: письмо уже
                      отправлено, и возврат означал бы второе такое же. */}
                  {step > 1 && step < 4 && (
                    <button className="btn-back" onClick={() => setStep((s) => (s - 1) as Step)}>←</button>
                  )}
                  
                  <button 
                    className="btn-gradient" 
                    onClick={step === 3 ? handleRegister : step === 4 ? handleVerify : next} 
                    disabled={loading} 
                    style={{ flex: 1 }}
                  >
                    {loading ? <><span className="spinner" /> {t("status.loading")}</> : step === 3 ? t("profile:accounts.register") : step === 4 ? `${t("buttons.continue")} →` : `${t("buttons.continue")} →`}
                  </button>
                </div>

                {/* ── ТЁМНАЯ ПЛАШКА ─────────────────────────────────────────
                    Та же, что на странице входа: вторая дверь под основной.
                    Кнопка Google видна сразу — способ должен быть на виду, а не
                    появляться из ниоткуда, — но до галочки она не срабатывает,
                    а ОБЪЯСНЯЕТ, чего не хватает. Перехватить её клик напрямую
                    нельзя (кнопка живёт в iframe Google), поэтому поверх неё
                    лежит прозрачная кнопка-перехватчик: пока согласия нет, клик
                    достаётся ей, и она показывает ошибку у самой галочки —
                    там, где её и надо поставить. Просто `pointer-events: none`
                    тут не годится: нажатие уходило бы в пустоту, и человек
                    решал бы, что кнопка сломана.
                    Согласие всё равно получено ДО того, как Google отдаст нам
                    хоть какие-то данные, — clickwrap в чистом виде.
                    Проверка остаётся и в обработчике: One Tap может всплыть
                    сам, без этой кнопки (GoogleSignIn, useOneTap). */}
                {step === 1 && (
                  <div style={{
                    padding: 16, borderRadius: 18, background: "var(--onyx, #1A1A1A)",
                    display: "flex", flexDirection: "column", gap: 14,
                  }}>
                    <div style={{ position: "relative", display: "flex", justifyContent: "center", width: "100%" }}>
                      {/* 132 = поля страницы, карточки и самой плашки —
                          ширина кнопки Google задаётся пикселем (iframe). */}
                      <div style={{ opacity: agree ? 1 : 0.5, transition: "opacity 0.2s", width: "100%", display: "flex", justifyContent: "center" }}>
                        <GoogleSignIn
                          dark
                          width={Math.min(320, window.innerWidth - 132)}
                          onCredential={(credential) => handleGoogleSuccess(credential)}
                          onError={() => setSubmitError(t("auth.googleFailed"))}
                        />
                      </div>
                      {!agree && (
                        <button
                          type="button"
                          aria-label={t("join:errors.consentRequired")}
                          onClick={() => setErrors((e) => ({ ...e, agree: t("join:errors.consentRequired") }))}
                          style={{ position: "absolute", inset: 0, background: "transparent", border: "none", cursor: "pointer" }}
                        />
                      )}
                    </div>

                    {/* Волосок стоит всегда: кнопка Google над ним теперь тоже
                        всегда на месте, и отступ не должен прыгать от галочки. */}
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      fontSize: 13, color: "rgba(255,255,255,0.6)",
                      borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 12,
                    }}>
                      {t("auth.haveAccount")}
                      <button
                        onClick={() => navigate("/login")}
                        style={{
                          background: "none", border: "none", padding: 0,
                          color: "var(--peach, #FCAE91)", fontFamily: "var(--font)",
                          fontSize: 13, fontWeight: 800, cursor: "pointer",
                        }}
                      >
                        {t("landing:nav.login")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="flex-between" style={{ borderTop: "1px solid var(--border)", padding: "16px 40px", position: "relative", zIndex: 1, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 12, color: "rgba(102,102,102,0.5)" }}>{t("landing:footer.copyright")}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, fontSize: 12 }}>
          {footerLinks.map(({ label, href }) => (
            <a key={label} href={href} {...LEGAL_LINK_PROPS} className="text-muted" style={{ textDecoration: "none", transition: "color 0.2s" }} onMouseOver={(e) => (e.currentTarget.style.color = "var(--onyx)")} onMouseOut={(e) => (e.currentTarget.style.color = "var(--muted)")}>{label}</a>
          ))}
          <button type="button" onClick={openCookieSettings} className="text-muted" style={{ background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer", transition: "color 0.2s" }} onMouseOver={(e) => (e.currentTarget.style.color = "var(--onyx)")} onMouseOut={(e) => (e.currentTarget.style.color = "var(--muted)")}>{t("cookies:profile.button")}</button>
        </div>
      </footer>
    </div>
  );
}
