import { useState, useEffect } from "react";
import "../App.css";
import {
  Orbs, Logo, InputField, PasswordStrength, StepDots,
  IconEmail, IconUser, IconLock, IconEyeOpen, IconEyeClosed, ErrorAlert
} from "../components/UI"; // 🔥 Весь UI подтягивается отсюда
import { useNavigate } from "react-router-dom";
import { GoogleSignIn } from '../components/cookies/GoogleSignIn';
import { openCookieSettings } from '../utils/cookieConsent';
import { authApi, ApiError } from '../api';
import { setActiveToken } from '../utils/auth';
import { legalFooterLinks, LEGAL_LINK_PROPS, PRIVACY_URL, TERMS_URL } from '../utils/legal';
import { getAnonId } from "../lib/anonId";
<<<<<<< HEAD
import { submitOnEnter } from "../lib/submitOnEnter";
=======
import { useTranslation } from 'react-i18next';
>>>>>>> bcf4a067f80368999140a9359ef17c722154c536

// ─── STEP TYPES ──────────────────────────────────────────────────────────────

type Step = 0 | 1 | 2 | 3 | 4;

// ─── CONSENT ─────────────────────────────────────────────────────────────────

/** Clickwrap-галочка: одно согласие покрывает Условия (вместе с приложением об
 *  обработке данных) и Политику — у документов общая редакция.
 *
 *  Стоит на ОБОИХ путях регистрации: и на email-шаге, и перед кнопкой Google.
 *  Мелкий текст «регистрируясь, вы принимаете» под Google был бы browsewrap —
 *  доказательства согласия он не даёт, а через Google приходит половина людей. */
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
    // Кнопка Google живёт в iframe — перехватить сам клик нельзя, поэтому
    // непринятые документы ловим здесь, а кнопку до галочки гасим (см. разметку).
    if (!agree) {
      setErrors({ agree: t("join:errors.consentRequired") });
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
    }
    if (s === 2) {
      if (!displayName.trim()) errs.displayName = t("validation.required");
      else if (displayName.trim().length < 2) errs.displayName = t("validation.minLength", { n: 2 });
    }
    if (s === 3) {
      if (!password) errs.password = t("join:errors.passwordRequired");
      else if (password.length < 8) errs.password = t("validation.minLength", { n: 8 });
      if (!agree) errs.agree = t("join:errors.consentRequired");
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
  const progressStep = step === 0 ? 0 : step - 1;

  // ── ICONS ──
  const eyeIcon = (open: boolean) => open 
    ? <IconEyeOpen />
    : <IconEyeClosed />;

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
        <div className="text-muted" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          {t("auth.haveAccount")} {" "}
          <button onClick={() => navigate("/login")} style={{ background: "none", border: "none", color: "var(--peach)", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
            {t("profile:accounts.login")} →
          </button>
        </div>
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
            ) : step === 0 ? (
              /* ── STEP 0: METHOD PICKER ── */
              <div className="step-enter flex-col gap-24">
                <div className="flex-col gap-8">
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", background: "linear-gradient(135deg, rgba(249,160,139,0.12), rgba(249,160,139,0.06))", border: "1px solid rgba(249,160,139,0.28)", borderRadius: 100, width: "fit-content" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--peach)", boxShadow: "0 0 0 3px var(--peach-glow)", animation: "pulse 2.4s ease-in-out infinite" }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--peach)", letterSpacing: "0.3px" }}>{t("landing:hero.perks.0")}</span>
                  </div>
                  <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px", lineHeight: 1.2 }}>{t("profile:accounts.register")}</h1>
                  <p className="text-muted" style={{ fontSize: 14, lineHeight: "1.6" }}>{t("landing:cta.lead")}</p>
                </div>

                <ConsentCheck checked={agree} error={errors.agree} onChange={(v) => { setAgree(v); clearErr("agree"); }} />

                {/* Пока документы не приняты, кнопка Google не кликается: она в
                    iframe, поэтому гасим её обёрткой, а не атрибутом disabled. */}
                <div style={{ display: "flex", justifyContent: "center", width: "100%", opacity: agree ? 1 : 0.45, pointerEvents: agree ? "auto" : "none", transition: "opacity 0.2s" }}>
                  <GoogleSignIn
                      /* См. Loginpage: 320px кнопки Google не влезают в
                         карточку на самом узком экране. */
                      width={Math.min(320, window.innerWidth - 76)}
                      onCredential={(credential) => handleGoogleSuccess(credential)}
                      onError={() => setSubmitError(t("auth.googleFailed"))}
                  />
                </div>

                <div className="flex-center gap-12">
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(102,102,102,0.5)", textTransform: "uppercase" }}>{t("auth.or")}</span>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>

                <button className="btn-gradient" onClick={() => setStep(1)}>
                  {<IconEmail />} {t("auth.registerByEmail")}
                </button>

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
                    <InputField label={`${t("auth.nameTitle")} *`} type="text" placeholder={t("auth.displayNamePlaceholder")} value={displayName} onChange={(v: string) => { setDisplayName(v); clearErr("displayName"); }} icon={<IconUser />} error={errors.displayName} autoComplete="nickname" />
                  )}
                  {step === 3 && (
                    <div className="flex-col gap-8">
                      <InputField
                        label={`${t("join:fields.password")} *`} type={showPassword ? "text" : "password"} placeholder={t("validation.minLength", { n: 8 })}
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

                {step === 3 && (
                  <ConsentCheck checked={agree} error={errors.agree} onChange={(v) => { setAgree(v); clearErr("agree"); }} />
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
                    {loading ? <><span className="spinner" /> {t("status.loading")}</> : step === 3 ? t("profile:accounts.register") : step === 4 ? `${t("buttons.continue")} →` : `${t("buttons.continue")} →`}
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
                      {["V","E","L","O","R"][i]}
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: 12, color: "rgba(102,102,102,0.6)", fontWeight: 500 }}><b style={{ color: "var(--onyx)" }}>2 400+</b> {t("auth.users")}</span>
              </div>
              <div className="flex-center" style={{ gap: 20 }}>
                {[ { label: "SSL" }, { label: "GDPR" }, { label: "2FA" } ].map((item, i) => (
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
