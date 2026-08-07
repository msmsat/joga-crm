import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "../../App.css";
import { isValidPhoneNumber } from "react-phone-number-input";
import {
  Logo, StepIndicator, PremiumSelect, LANGUAGES,
  Illustration1, Illustration2, Illustration3, Illustration4, Illustration5,
} from "../UI";
import { authApi, studioApi } from '../../api';
import StepIdentity from "./onboarding/StepIdentity";
import StepActivity from "./onboarding/StepActivity";
import StepContact from "./onboarding/StepContact";
import StepSettings from "./onboarding/StepSettings";
import StepSchedule from "./onboarding/StepSchedule";
import type { OnboardingData } from "./onboarding/types";
import { DEFAULT_WORKING_HOURS } from "./onboarding/types";
import { setActiveToken } from '../../utils/auth';

type Step = 1 | 2 | 3 | 4 | 5;

// Выбор языка на онбординге запоминаем отдельно от studio.language — до создания
// студии привязывать его не к чему, а после DashboardLayout сам синхронизирует i18n.
const ONBOARDING_LANG_KEY = "onboarding_language";

export default function OnboardingPage() {
  const { t, i18n } = useTranslation("onboarding");

  // Доп. студия для уже онбординженного владельца (EPIC 7, задача 5) — тот же мастер,
  // меняется только конечный вызов; is_onboarded у пользователя не трогаем (см. App.tsx).
  const [searchParams] = useSearchParams();
  const isNewStudio = searchParams.get("new") === "1";
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>(1);
  const [dir, setDir] = useState<1 | -1>(1);
  const [animating, setAnimating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorModal, setErrorModal] = useState<{ visible: boolean; message: string }>({ visible: false, message: "" });
  const [data, setData] = useState<OnboardingData>({
    studioName: "",
    description: "",
    logoFile: null,
    logoPreviewUrl: "",
    activityType: "",
    phone: "",
    address: "",
    email: "",
    website: "",
    timezone: "UTC+1",
    language: localStorage.getItem(ONBOARDING_LANG_KEY) || "en",
    currency: "RUB",
    dateFormat: "DD.MM.YYYY",
    firstDayOfWeek: "monday",
    workingHours: DEFAULT_WORKING_HOURS,
  });

  // Онбординг стартует на английском по умолчанию, независимо от языка, оставшегося
  // от предыдущей студии пользователя (DashboardLayout синхронизирует его обратно после финиша) —
  // но если человек уже выбирал язык на онбординге раньше, помним его выбор (см. ONBOARDING_LANG_KEY).
  useEffect(() => {
    i18n.changeLanguage(data.language);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function patch(update: Partial<OnboardingData>) {
    setData(d => ({ ...d, ...update }));
    if (update.language) {
      i18n.changeLanguage(update.language);
      localStorage.setItem(ONBOARDING_LANG_KEY, update.language);
    }
  }

  const STEP_META = [
    { title: t("onboarding:steps.identity.title"), desc: t("onboarding:steps.identity.desc") },
    { title: t("onboarding:steps.activity.title"), desc: t("onboarding:steps.activity.desc") },
    { title: t("onboarding:steps.contact.title"), desc: t("onboarding:steps.contact.desc") },
    { title: t("onboarding:steps.settings.title"), desc: t("onboarding:steps.settings.desc") },
    { title: t("onboarding:steps.schedule.title"), desc: t("onboarding:steps.schedule.desc") },
  ];

  // Это контакт БИЗНЕСА, а не аккаунта владельца: на занятость не проверяем —
  // один номер можно указать и студии, и филиалу, и тренеру одновременно
  // (docs/ROADMAP_ACCOUNTS, «Вне scope»). Личный номер владельца спрашивает
  // PhoneGate в кабинете. Проверяем только формат.

  function goNext() {
    if (animating) return;
    setDir(1);
    setAnimating(true);
    setTimeout(() => {
      setStep(s => Math.min(s + 1, 5) as Step);
      setAnimating(false);
    }, 220);
  }

  function goBack() {
    if (animating || step === 1) return;
    setDir(-1);
    setAnimating(true);
    setTimeout(() => {
      setStep(s => Math.max(s - 1, 1) as Step);
      setAnimating(false);
    }, 220);
  }

  async function handleFinish() {
    if (!data.timezone || !data.language || !data.currency) {
      alert(t("onboarding:wizard.regionRequired"));
      return;
    }
    setIsSubmitting(true);

    try {
      let logoUrl: string | null = null;

      if (data.logoFile) {
        const { url } = await studioApi.uploadLogo(data.logoFile);
        logoUrl = url;
      }

      const payload = {
        studioName: data.studioName,
        description: data.description || null,
        logoUrl,
        activityType: data.activityType,
        phone: data.phone,
        address: data.address || null,
        email: data.email || null,
        website: data.website || null,
        timezone: data.timezone,
        language: data.language,
        currency: data.currency,
        dateFormat: data.dateFormat,
        firstDayOfWeek: data.firstDayOfWeek,
        workingHours: data.workingHours.map(d => ({
          dayOfWeek: d.dayOfWeek,
          isOpen: d.isOpen,
          openTime: d.openTime,
          closeTime: d.closeTime,
        })),
      };
      const responseData = isNewStudio
        ? await authApi.createStudio(payload)
        : await authApi.onboarding(payload);

      if (responseData.access_token) {
        setActiveToken(responseData.access_token);
      }
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("onboarding:wizard.networkError");
      setErrorModal({ visible: true, message: msg });
      setIsSubmitting(false);
    }
  }

  function closeErrorModal() {
    const wasPhoneTaken = errorModal.message.includes("номер");
    setErrorModal({ visible: false, message: "" });
    if (wasPhoneTaken) setStep(3);
  }

  useEffect(() => {
    if (!errorModal.visible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeErrorModal(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [errorModal.visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const canProceed1 = data.studioName.trim().length >= 2;
  const canProceed2 = data.activityType !== "";
  const canProceed3 = !!data.phone && isValidPhoneNumber(data.phone);
  const canProceed4 = !!(data.timezone && data.language && data.currency);
  const canProceed5 = true;

  const canProceedCurrent =
    (step === 1 && canProceed1) ||
    (step === 2 && canProceed2) ||
    (step === 3 && canProceed3) ||
    (step === 4 && canProceed4) ||
    (step === 5 && canProceed5);

  const meta = STEP_META[step - 1];

  const animStyle: React.CSSProperties = {
    flex: 1,
    animation: animating
      ? (dir === 1 ? "slideOutRight 0.2s ease forwards" : "slideOutLeft 0.2s ease forwards")
      : (dir === 1 ? "slideInRight 0.3s cubic-bezier(0.34,1.1,0.64,1)" : "slideInLeft 0.3s cubic-bezier(0.34,1.1,0.64,1)"),
  };

  return (
    <>
    <div
      className="velora-modal ob-modal"
      style={{
        width: "100%", maxWidth: "920px", minHeight: "min(560px, calc(100vh - 40px))", maxHeight: "calc(100vh - 40px)",
        background: "var(--bg)", borderRadius: "24px",
        boxShadow: "0 48px 120px rgba(26,26,26,0.18), 0 8px 32px rgba(26,26,26,0.08)",
        display: "flex", alignItems: "stretch", overflow: "hidden",
        animation: "modalIn 0.3s ease",
        position: "relative",
      }}
    >
      {/* ── LEFT PANEL ── */}
      <div className="ob-left" style={{
        flex: "1 1 0", background: "var(--bg-card)", padding: "44px 36px",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        borderRight: "1px solid #F0EDE8", position: "relative", overflow: "hidden", minHeight: 0, minWidth: 0,
      }}>
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: `
            radial-gradient(circle at 20% 20%, rgba(252,174,145,0.06) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(163,201,168,0.06) 0%, transparent 50%)
          `,
        }} />

        <div style={{ position: "relative", zIndex: 1, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
            <Logo />
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
              <div style={{ width: "132px", flexShrink: 0 }}>
                <PremiumSelect
                  value={data.language}
                  onChange={(v) => patch({ language: v })}
                  options={LANGUAGES}
                  placeholder={t("onboarding:settings.languagePlaceholder")}
                />
              </div>
              {/* Выход — только для дополнительной студии. Первичный онбординг
                  закрывать некуда: без студии в CRM работать нельзя, поэтому
                  там крестика нет намеренно. А из «создать ещё одну» иначе не
                  выбраться — только перезагрузкой страницы. */}
              {isNewStudio && (
                <button
                  type="button"
                  onClick={() => navigate("/select-crm")}
                  aria-label={t("common:buttons.close", { defaultValue: "Закрыть" })}
                  style={{
                    width: "34px", height: "34px", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "none", borderRadius: "10px",
                    background: "rgba(var(--ink),0.05)", color: "var(--muted)", cursor: "pointer",
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div style={{ marginTop: "28px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, color: "#FCAE91", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 8px" }}>
              {t("onboarding:wizard.stepOf", { step, total: 5 })}
            </p>
            <h2 style={{ fontSize: "21px", fontWeight: 900, color: "var(--onyx)", letterSpacing: "-0.7px", lineHeight: 1.25, margin: "0 0 8px", whiteSpace: "pre-line" }}>
              {meta.title}
            </h2>
            <p style={{ fontSize: "12px", color: "var(--text3)", lineHeight: "1.6", margin: 0 }}>
              {meta.desc}
            </p>
          </div>
          <div style={{ marginTop: "22px" }}>
            <StepIndicator current={step} total={5} />
          </div>
        </div>

        {/* Illustration */}
        <div className="ob-illustration" style={{
          flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center",
          padding: "16px 0", position: "relative", zIndex: 1, overflow: "hidden",
        }}>
          {step === 1 && <Illustration1 studioName={data.studioName} logoPreviewUrl={data.logoPreviewUrl} />}
          {step === 2 && <Illustration2 activityType={data.activityType} />}
          {step === 3 && <Illustration3 phone={data.phone} email={data.email} address={data.address} />}
          {step === 4 && <Illustration4 timezone={data.timezone} currency={data.currency} language={data.language} />}
          {step === 5 && <Illustration5 workingHours={data.workingHours} />}
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "10px 12px", background: "rgba(163,201,168,0.1)",
          borderRadius: "10px", position: "relative", zIndex: 1, flexShrink: 0,
        }}>
          <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#A3C9A8", animation: "stepPulse 2s infinite" }} />
          <span style={{ fontSize: "11px", color: "var(--muted)", fontWeight: 500 }}>
            {t("onboarding:wizard.securityNote")}
          </span>
        </div>
      </div>

      {/* ── RIGHT PANEL ──
          Скролл живёт ТОЛЬКО на контенте шага (.ob-right-scroll), а панель навигации
          закреплена снизу как футер: иначе на низких экранах кнопка «Продолжить»
          уезжала под край модалки и мастер было не пройти. */}
      <div className="ob-right" style={{
        flex: "1 1 0", padding: "44px 40px", display: "flex", flexDirection: "column",
        position: "relative", overflow: "hidden", minWidth: 0, minHeight: 0,
      }}>
        <div className="ob-right-scroll" style={{
          flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
          overflowX: "hidden", overflowY: "auto", marginRight: "-8px", paddingRight: "8px",
        }}>
          <div key={step} style={animStyle}>
            {step === 1 && <StepIdentity data={data} onChange={patch} />}
            {step === 2 && <StepActivity data={data} onChange={patch} />}
            {step === 3 && <StepContact data={data} onChange={patch} />}
            {step === 4 && <StepSettings data={data} onChange={patch} />}
            {step === 5 && <StepSchedule data={data} onChange={patch} />}
          </div>
        </div>

        {/* ── ACTION BUTTONS (закреплённый футер) ── */}
        <div className="ob-footer" style={{ flexShrink: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: "10px",
          marginTop: "24px", paddingTop: "18px", borderTop: "1px solid #F0EDE8",
        }}>
          {step > 1 && (
            <button
              type="button"
              onClick={goBack}
              style={{
                padding: "13px 18px", background: "transparent",
                border: "1.5px solid #EEEBE6", borderRadius: "12px",
                fontSize: "14px", fontWeight: 600, color: "var(--text3)",
                cursor: "pointer", display: "flex", alignItems: "center",
                gap: "6px", fontFamily: "inherit", transition: "background 0.15s ease",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.03)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t("onboarding:wizard.back")}
            </button>
          )}

          <button
            type="button"
            disabled={isSubmitting || !canProceedCurrent}
            onClick={step === 5 ? handleFinish : goNext}
            style={{
              flex: 1, padding: "13px 24px",
              background: "linear-gradient(135deg, #FCAE91, #F9A08B)",
              border: "none", borderRadius: "12px", fontSize: "15px",
              fontWeight: 700, color: "white", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: "8px", letterSpacing: "-0.1px",
              boxShadow: "0 8px 24px rgba(252,174,145,0.42)",
              transition: "all 0.2s ease", fontFamily: "inherit",
              opacity: (isSubmitting || !canProceedCurrent) ? 0.45 : 1,
            }}
            onMouseEnter={e => {
              if (isSubmitting || !canProceedCurrent) return;
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 12px 30px rgba(252,174,145,0.55)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.boxShadow = "0 8px 24px rgba(252,174,145,0.42)";
            }}
          >
            {isSubmitting
              ? t("onboarding:wizard.saving")
              : step === 5
                ? t("onboarding:wizard.finish")
                : t("onboarding:wizard.continue")}
            {!isSubmitting && step !== 5 && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4L10 8L6 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>

        <p style={{ textAlign: "center", fontSize: "11px", color: "#CCCCCC", margin: "8px 0 0", fontWeight: 500 }}>
          {t("onboarding:wizard.progress", { step, total: 5 })}
        </p>
        </div>
      </div>

    </div>

    {/* ── ERROR MODAL ──
        Живёт вне карточки мастера и на position: fixed — оверлей закрывает весь
        экран, а не только модалку онбординга. Блюр намеренно почти незаметный
        (2px): затемнение делает работу, тяжёлый backdrop-filter во весь вьюпорт
        раньше стоил лагов на открытии. */}
    {errorModal.visible && (
      <div
        onClick={closeErrorModal}
        style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(var(--ink),0.34)",
          backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "20px", animation: "modalIn 0.22s ease",
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: "var(--bg-card)", borderRadius: "24px", padding: "38px 34px 28px",
            maxWidth: "384px", width: "100%", textAlign: "center",
            border: "1px solid rgba(var(--ink),0.05)",
            boxShadow: "0 40px 100px rgba(26,26,26,0.22), 0 8px 24px rgba(26,26,26,0.07)",
            animation: "errorPopIn 0.32s cubic-bezier(0.34,1.28,0.64,1)",
          }}
        >
          <div style={{
            width: "64px", height: "64px", borderRadius: "50%", margin: "0 auto 20px",
            background: "radial-gradient(circle at 50% 38%, rgba(216,140,154,0.2), rgba(216,140,154,0.07))",
            boxShadow: "0 0 0 9px rgba(216,140,154,0.05)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9.25" stroke="#D88C9A" strokeWidth="1.5"/>
              <path d="M12 7.5V13" stroke="#D88C9A" strokeWidth="1.8" strokeLinecap="round"/>
              <circle cx="12" cy="16.4" r="1.05" fill="#D88C9A"/>
            </svg>
          </div>

          <h3 style={{ fontSize: "19px", fontWeight: 900, color: "var(--onyx)", margin: "0 0 10px", letterSpacing: "-0.5px" }}>
            {t("onboarding:wizard.errorTitle")}
          </h3>
          <p style={{ fontSize: "14px", color: "#8A8A8A", margin: "0 0 26px", lineHeight: "1.65" }}>
            {errorModal.message}
          </p>

          <button
            type="button"
            autoFocus
            onClick={closeErrorModal}
            style={{
              width: "100%", padding: "14px",
              background: "linear-gradient(135deg, #FCAE91, #F9A08B)",
              border: "none", borderRadius: "14px", fontSize: "15px",
              fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit",
              boxShadow: "0 10px 26px rgba(252,174,145,0.34)",
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 14px 32px rgba(252,174,145,0.42)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 10px 26px rgba(252,174,145,0.34)"; }}
          >
            {t("onboarding:wizard.gotIt")}
          </button>
        </div>
      </div>
    )}
    </>
  );
}
