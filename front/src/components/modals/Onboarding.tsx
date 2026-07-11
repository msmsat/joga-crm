import React, { useState, useEffect } from "react";
import "../../App.css";
import { isValidPhoneNumber } from "react-phone-number-input";
import {
  Logo, StepIndicator,
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

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_META = [
  { title: "О студии",    desc: "Название, описание и визуальный стиль вашего бренда." },
  { title: "Деятельность", desc: "Выберите направление, чтобы мы настроили CRM под вас." },
  { title: "Контакты",   desc: "Адрес, телефон и ссылки для ваших клиентов." },
  { title: "Настройки",  desc: "Регион, валюта и формат дат." },
  { title: "График работы", desc: "Укажите дни и часы работы студии." },
];

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(1);
  const [dir, setDir] = useState<1 | -1>(1);
  const [animating, setAnimating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [isCheckingPhone, setIsCheckingPhone] = useState(false);
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
    timezone: "UTC+3",
    language: "ru",
    currency: "RUB",
    dateFormat: "DD.MM.YYYY",
    firstDayOfWeek: "monday",
    workingHours: DEFAULT_WORKING_HOURS,
  });

  function patch(update: Partial<OnboardingData>) {
    setData(d => ({ ...d, ...update }));
  }

  useEffect(() => {
    if (!data.phone || !isValidPhoneNumber(data.phone)) {
      setPhoneError(null);
      setIsCheckingPhone(false);
      return;
    }
    setIsCheckingPhone(true);
    setPhoneError(null);
    const timer = setTimeout(async () => {
      try {
        const json = await authApi.checkPhone(data.phone);
        setPhoneError(json.taken ? "Этот номер уже зарегистрирован в системе" : null);
      } catch {
        setPhoneError(null);
      } finally {
        setIsCheckingPhone(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [data.phone]);

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
      alert("Укажите региональные настройки");
      return;
    }
    setIsSubmitting(true);

    try {
      let logoUrl: string | null = null;

      if (data.logoFile) {
        const { url } = await studioApi.uploadLogo(data.logoFile);
        logoUrl = url;
      }

      const responseData = await authApi.onboarding({
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
      });

      if (responseData.access_token) {
        localStorage.setItem('token', responseData.access_token);
      }
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Сетевая ошибка при сохранении данных.";
      setErrorModal({ visible: true, message: msg });
      setIsSubmitting(false);
    }
  }

  const canProceed1 = data.studioName.trim().length >= 2;
  const canProceed2 = data.activityType !== "";
  const canProceed3 = !!data.phone && isValidPhoneNumber(data.phone) && !phoneError && !isCheckingPhone;
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
    <div
      className="velora-modal"
      style={{
        width: "100%", maxWidth: "920px", minHeight: "min(560px, calc(100vh - 40px))", maxHeight: "calc(100vh - 40px)",
        background: "#FDFCFB", borderRadius: "24px",
        boxShadow: "0 48px 120px rgba(26,26,26,0.18), 0 8px 32px rgba(26,26,26,0.08)",
        display: "grid", gridTemplateColumns: "1fr 1fr", overflow: "hidden",
        animation: "modalIn 0.45s cubic-bezier(0.34,1.1,0.64,1)",
        position: "relative",
      }}
    >
      {/* ── LEFT PANEL ── */}
      <div style={{
        background: "white", padding: "44px 36px",
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        borderRight: "1px solid #F0EDE8", position: "relative", overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: `
            radial-gradient(circle at 20% 20%, rgba(252,174,145,0.06) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(163,201,168,0.06) 0%, transparent 50%)
          `,
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <Logo />
          <div style={{ marginTop: "28px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, color: "#FCAE91", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 8px" }}>
              Шаг {step} из 5
            </p>
            <h2 style={{ fontSize: "21px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.7px", lineHeight: 1.25, margin: "0 0 8px", whiteSpace: "pre-line" }}>
              {meta.title}
            </h2>
            <p style={{ fontSize: "12px", color: "#999", lineHeight: "1.6", margin: 0 }}>
              {meta.desc}
            </p>
          </div>
          <div style={{ marginTop: "22px" }}>
            <StepIndicator current={step} total={5} />
          </div>
        </div>

        {/* Illustration */}
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          padding: "16px 0", position: "relative", zIndex: 1,
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
          borderRadius: "10px", position: "relative", zIndex: 1,
        }}>
          <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#A3C9A8", animation: "stepPulse 2s infinite" }} />
          <span style={{ fontSize: "11px", color: "#666", fontWeight: 500 }}>
            Данные защищены и не передаются третьим лицам
          </span>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{
        padding: "44px 40px", display: "flex", flexDirection: "column",
        justifyContent: "space-between", position: "relative", overflowX: "hidden", overflowY: "auto",
      }}>
        <div key={step} style={animStyle}>
          {step === 1 && <StepIdentity data={data} onChange={patch} />}
          {step === 2 && <StepActivity data={data} onChange={patch} />}
          {step === 3 && <StepContact data={data} onChange={patch} phoneError={phoneError} isCheckingPhone={isCheckingPhone} />}
          {step === 4 && <StepSettings data={data} onChange={patch} />}
          {step === 5 && <StepSchedule data={data} onChange={patch} />}
        </div>

        {/* ── ACTION BUTTONS ── */}
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
                fontSize: "14px", fontWeight: 600, color: "#888",
                cursor: "pointer", display: "flex", alignItems: "center",
                gap: "6px", fontFamily: "inherit", transition: "background 0.15s ease",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,0,0,0.03)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Назад
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
              boxShadow: "0 8px 24px rgba(252,174,145,0.3)",
              transition: "all 0.2s ease", fontFamily: "inherit",
              opacity: (isSubmitting || !canProceedCurrent) ? 0.45 : 1,
            }}
          >
            {isSubmitting
              ? "Сохраняем..."
              : step === 5
                ? "Начать работу"
                : "Продолжить"}
            {!isSubmitting && step !== 5 && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4L10 8L6 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>

        <p style={{ textAlign: "center", fontSize: "11px", color: "#CCCCCC", margin: "8px 0 0", fontWeight: 500 }}>
          {step}/5 — займёт меньше 3 минут
        </p>
      </div>

      {/* ── ERROR MODAL OVERLAY ── */}
      {errorModal.visible && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(26,26,26,0.55)",
          backdropFilter: "blur(6px)", display: "flex", alignItems: "center",
          justifyContent: "center", zIndex: 50, borderRadius: "24px",
        }}>
          <div style={{
            background: "white", borderRadius: "20px", padding: "36px 32px",
            maxWidth: "340px", width: "90%", textAlign: "center",
            boxShadow: "0 32px 80px rgba(26,26,26,0.2)",
            animation: "modalIn 0.3s cubic-bezier(0.34,1.1,0.64,1)",
          }}>
            <div style={{
              width: "56px", height: "56px", borderRadius: "50%",
              background: "rgba(216,140,154,0.1)", display: "flex",
              alignItems: "center", justifyContent: "center", margin: "0 auto 20px",
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#D88C9A" strokeWidth="1.5"/>
                <path d="M15 9L9 15M9 9L15 15" stroke="#D88C9A" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <h3 style={{ fontSize: "18px", fontWeight: 900, color: "#1A1A1A", margin: "0 0 8px", letterSpacing: "-0.5px" }}>
              {errorModal.message.includes("номер") ? "Номер уже используется" : "Ошибка"}
            </h3>
            <p style={{ fontSize: "14px", color: "#888", margin: "0 0 24px", lineHeight: "1.6" }}>
              {errorModal.message}
            </p>
            <button
              type="button"
              onClick={() => {
                setErrorModal({ visible: false, message: "" });
                if (errorModal.message.includes("номер")) setStep(3);
              }}
              style={{
                width: "100%", padding: "13px",
                background: "linear-gradient(135deg, #FCAE91, #F9A08B)",
                border: "none", borderRadius: "12px", fontSize: "15px",
                fontWeight: 700, color: "white", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {errorModal.message.includes("номер") ? "Изменить номер" : "Понятно"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
