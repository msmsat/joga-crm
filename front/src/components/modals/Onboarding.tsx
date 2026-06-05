import React, { useState } from "react";
import "../../App.css";
import { isValidPhoneNumber } from "react-phone-number-input";
import {
  Logo, InputField, PhoneField, StepIndicator, PremiumSelect,
  BUSINESS_CATEGORIES, TIMEZONES, LANGUAGES, CURRENCIES,
  Step1Illustration, Step2Illustration, Step3Illustration
} from "../UI";

// ─── TYPES ────────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3;

interface OnboardingData {
  studioName: string;
  phone: string;
  businessType: string;
  businessSubtype: string;
  timezone: string;
  language: string;
  currency: string;
}

// ─── MAIN MODAL ───────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(1);
  const [dir, setDir] = useState<1 | -1>(1);
  const [animating, setAnimating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    studioName: "",
    phone: "",
    businessType: "",
    businessSubtype: "",
    timezone: "UTC+3",
    language: "ru",
    currency: "RUB",
  });

  const selectedCategory = BUSINESS_CATEGORIES.find(c => c.id === data.businessType);

  function goNext() {
    if (animating) return;
    setDir(1);
    setAnimating(true);
    setTimeout(() => {
      setStep(s => Math.min(s + 1, 3) as Step);
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
    // 1. Финальная жесткая проверка перед отправкой на бэкенд
    if (data.studioName.trim().length < 2) {
      alert("Название студии слишком короткое");
      return;
    }
    if (!data.phone || !isValidPhoneNumber(data.phone)) {
      alert("Укажите корректный номер телефона");
      return;
    }
    if (!data.businessType || !data.businessSubtype) {
      alert("Выберите тип бизнеса");
      return;
    }

    // 2. Включаем индикатор загрузки
    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      // Отправляем данные (бэкенд сам создаст студию и поставит is_onboarded = True)
      const res = await fetch("http://localhost:8000/auth/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        // Успех! Перезагружаем страницу, App.tsx увидит флаг и пустит в Дашборд
        window.location.href = '/dashboard'; 
      } else {
        const errorData = await res.json();
        alert(`Ошибка: ${errorData.detail || 'Не удалось сохранить настройки'}`);
        setIsSubmitting(false); // Выключаем загрузку, если ошибка
      }
    } catch (e) {
      alert("Сетевая ошибка при сохранении данных.");
      setIsSubmitting(false);
    }
  }

  const canProceedStep1 = data.studioName.trim().length >= 2 && data.phone && isValidPhoneNumber(data.phone);
  const canProceedStep2 = data.businessType !== "" && data.businessSubtype !== "";
  const canProceedStep3 = data.timezone && data.language && data.currency;

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "12px",
    fontWeight: 700,
    color: "#666",
    letterSpacing: "0.5px",
    textTransform: "uppercase" as const,
    marginBottom: "8px",
  };

  return (
    <div
      className="velora-modal"
      style={{
        width: "100%",
        maxWidth: "900px",
        minHeight: "540px",
        background: "#FDFCFB",
        borderRadius: "24px",
        boxShadow: "0 48px 120px rgba(26,26,26,0.18), 0 8px 32px rgba(26,26,26,0.08)",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        overflow: "hidden",
        animation: "modalIn 0.45s cubic-bezier(0.34,1.1,0.64,1)",
        position: "relative",
      }}
    >
      {/* ── LEFT PANEL (Illustration) ── */}
      <div style={{
        background: "white",
        padding: "48px 40px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        borderRight: "1px solid #F0EDE8",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Subtle mesh background */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `
            radial-gradient(circle at 20% 20%, rgba(252,174,145,0.06) 0%, transparent 50%),
            radial-gradient(circle at 80% 80%, rgba(163,201,168,0.06) 0%, transparent 50%)
          `,
          pointerEvents: "none",
        }} />

        {/* Logo */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <Logo />

          <div style={{ marginTop: "32px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, color: "#FCAE91", letterSpacing: "2px", textTransform: "uppercase", margin: "0 0 8px" }}>
              Шаг {step} из 3
            </p>
            <h2 style={{ fontSize: "22px", fontWeight: 900, color: "#1A1A1A", letterSpacing: "-0.8px", lineHeight: "1.25", margin: "0 0 10px", whiteSpace: "pre-line" }}>
              {step === 1 ? "О вашем\nбизнесе" : step === 2 ? "Сфера\nдеятельности" : "Регион и\nязык"}
            </h2>
            <p style={{ fontSize: "13px", color: "#888", lineHeight: "1.6", margin: 0 }}>
              {step === 1 && "Как нам называть вас? Введите название компании и номер телефона."}
              {step === 2 && "Выберите сферу, чтобы мы настроили CRM идеально под вас."}
              {step === 3 && "Последний шаг — региональные настройки для удобной работы."}
            </p>
          </div>

          <div style={{ marginTop: "28px" }}>
            <StepIndicator current={step} total={3} />
          </div>
        </div>

        {/* Illustration */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px 0",
          position: "relative", zIndex: 1,
        }}>
          {step === 1 && <Step1Illustration />}
          {step === 2 && <Step2Illustration selected={data.businessType} />}
          {step === 3 && <Step3Illustration />}
        </div>

        {/* Bottom trust signal */}
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "12px 14px",
          background: "rgba(163,201,168,0.1)",
          borderRadius: "10px",
          position: "relative", zIndex: 1,
        }}>
          <div style={{
            width: "8px", height: "8px",
            borderRadius: "50%",
            background: "#A3C9A8",
            animation: "stepPulse 2s infinite",
          }} />
          <span style={{ fontSize: "12px", color: "#666", fontWeight: 500 }}>
            Данные защищены и не передаются третьим лицам
          </span>
        </div>
      </div>

      {/* ── RIGHT PANEL (Form) ── */}
      <div style={{
        padding: "48px 44px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Step content with animation */}
        <div
          key={step}
          style={{
            flex: 1,
            animation: animating
              ? (dir === 1 ? "slideOutRight 0.2s ease forwards" : "slideOutLeft 0.2s ease forwards")
              : (dir === 1 ? "slideInRight 0.3s cubic-bezier(0.34,1.1,0.64,1)" : "slideInLeft 0.3s cubic-bezier(0.34,1.1,0.64,1)"),
          }}
        >
          {/* ── STEP 1 ── */}
          {step === 1 && (
            <div>
              <div style={{ marginBottom: "32px" }}>
                <h3 style={{
                  fontSize: "26px", fontWeight: 900, color: "#1A1A1A",
                  letterSpacing: "-1px", margin: "0 0 8px",
                }}>
                  Добро пожаловать 👋
                </h3>
                <p style={{ fontSize: "14px", color: "#888", margin: 0, lineHeight: "1.6" }}>
                  Пара минут настройки — и ваш рабочий инструмент готов
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <InputField
                  label="Название студии или компании"
                  placeholder="Например: Studio Forma"
                  value={data.studioName}
                  onChange={(v: string) => setData(d => ({ ...d, studioName: v }))}
                />

                <PhoneField
                  label="Номер телефона"
                  value={data.phone}
                  onChange={(v: string) => setData(d => ({ ...d, phone: v || "" }))}
                />

                {/* Preview card */}
                {data.studioName.trim().length > 0 && (
                  <div style={{
                    padding: "16px 18px",
                    background: "linear-gradient(135deg, rgba(252,174,145,0.08), rgba(163,201,168,0.05))",
                    borderRadius: "14px",
                    border: "1.5px solid rgba(252,174,145,0.2)",
                    animation: "slideInRight 0.25s ease",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{
                        width: "40px", height: "40px",
                        background: "linear-gradient(135deg, #FCAE91, #F9A08B)",
                        borderRadius: "12px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "18px", fontWeight: 900, color: "white",
                      }}>
                        {data.studioName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "14px", color: "#1A1A1A" }}>
                          {data.studioName}
                        </div>
                        <div style={{ fontSize: "12px", color: "#AAAAAA" }}>
                          {data.phone || "Телефон не указан"}
                        </div>
                      </div>
                      <div style={{
                        marginLeft: "auto",
                        padding: "3px 8px",
                        background: "rgba(163,201,168,0.2)",
                        borderRadius: "6px",
                        fontSize: "10px",
                        fontWeight: 700,
                        color: "#5A8A60",
                        letterSpacing: "0.5px",
                      }}>
                        НОВЫЙ
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <div>
              <div style={{ marginBottom: "24px" }}>
                <h3 style={{
                  fontSize: "24px", fontWeight: 900, color: "#1A1A1A",
                  letterSpacing: "-0.8px", margin: "0 0 6px",
                }}>
                  Чем занимается бизнес?
                </h3>
                <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
                  Выберите категорию и конкретный тип
                </p>
              </div>

              {/* Category grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
                marginBottom: "16px",
              }}>
                {BUSINESS_CATEGORIES.map((cat) => {
                  const isSelected = data.businessType === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className="business-chip"
                      onClick={() => setData(d => ({ ...d, businessType: cat.id, businessSubtype: "" }))}
                      style={{
                        padding: "11px 14px",
                        background: isSelected ? "rgba(252,174,145,0.1)" : "white",
                        border: isSelected ? "1.5px solid #FCAE91" : "1.5px solid #EEEBE6",
                        borderRadius: "12px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        textAlign: "left",
                        fontFamily: "inherit",
                      }}
                    >
                      <span style={{ fontSize: "18px", lineHeight: 1 }}>{cat.icon}</span>
                      <span style={{
                        fontSize: "12px",
                        fontWeight: isSelected ? 700 : 500,
                        color: isSelected ? "#1A1A1A" : "#555",
                        lineHeight: "1.3",
                      }}>{cat.label}</span>
                      {isSelected && (
                        <div style={{
                          marginLeft: "auto",
                          width: "16px", height: "16px",
                          background: "#FCAE91",
                          borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          animation: "checkPopRotate 0.3s cubic-bezier(0.34,1.1,0.64,1)",
                          flexShrink: 0,
                        }}>
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1 4L3 6L7 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Subtypes */}
              {selectedCategory && (
                <div style={{ animation: "slideInRight 0.25s cubic-bezier(0.34,1.1,0.64,1)" }}>
                  <label style={labelStyle}>Уточните тип</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {selectedCategory.subtypes.map((sub) => {
                      const isSubSelected = data.businessSubtype === sub;
                      return (
                        <button
                          key={sub}
                          type="button"
                          className="subtype-pill"
                          onClick={() => setData(d => ({ ...d, businessSubtype: sub }))}
                          style={{
                            padding: "6px 12px",
                            background: isSubSelected ? "rgba(252,174,145,0.15)" : "rgba(0,0,0,0.04)",
                            border: isSubSelected ? "1.5px solid #FCAE91" : "1.5px solid transparent",
                            borderRadius: "20px",
                            fontSize: "12px",
                            fontWeight: isSubSelected ? 700 : 500,
                            color: isSubSelected ? "#1A1A1A" : "#666",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {isSubSelected && "✓ "}{sub}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <div>
              <div style={{ marginBottom: "28px" }}>
                <h3 style={{
                  fontSize: "24px", fontWeight: 900, color: "#1A1A1A",
                  letterSpacing: "-0.8px", margin: "0 0 6px",
                }}>
                  Региональные настройки
                </h3>
                <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
                  Эти параметры всегда можно изменить в настройках
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                <div>
                  <label style={labelStyle}>Часовой пояс</label>
                  <PremiumSelect
                    value={data.timezone}
                    onChange={v => setData(d => ({ ...d, timezone: v }))}
                    options={TIMEZONES}
                    placeholder="Выберите часовой пояс"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Язык интерфейса</label>
                  <PremiumSelect
                    value={data.language}
                    onChange={v => setData(d => ({ ...d, language: v }))}
                    options={LANGUAGES}
                    placeholder="Выберите язык"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Валюта</label>
                  <PremiumSelect
                    value={data.currency}
                    onChange={v => setData(d => ({ ...d, currency: v }))}
                    options={CURRENCIES}
                    placeholder="Выберите валюту"
                  />
                </div>

                {/* Summary card */}
                <div style={{
                  padding: "16px 18px",
                  background: "rgba(26,26,26,0.03)",
                  borderRadius: "14px",
                  border: "1.5px solid #F0EDE8",
                }}>
                  <p style={{ fontSize: "11px", fontWeight: 700, color: "#AAAAAA", letterSpacing: "0.5px", margin: "0 0 10px", textTransform: "uppercase" }}>
                    Итог настройки
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {[
                      { label: "Компания", value: data.studioName },
                      { label: "Сфера", value: data.businessSubtype },
                      { label: "Часовой пояс", value: TIMEZONES.find(t => t.value === data.timezone)?.label.split(" ")[0] },
                      { label: "Язык", value: LANGUAGES.find(l => l.value === data.language)?.label },
                      { label: "Валюта", value: CURRENCIES.find(c => c.value === data.currency)?.label },
                    ].map((row) => (
                      <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", color: "#AAAAAA" }}>{row.label}</span>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "#1A1A1A" }}>{row.value || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── ACTION BUTTONS ── */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginTop: "28px",
          paddingTop: "20px",
          borderTop: "1px solid #F0EDE8",
        }}>
          {step > 1 && (
            <button
              type="button"
              className="back-btn"
              onClick={goBack}
              style={{
                padding: "14px 18px",
                background: "transparent",
                border: "1.5px solid #EEEBE6",
                borderRadius: "12px",
                fontSize: "14px",
                fontWeight: 600,
                color: "#888",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontFamily: "inherit",
                transition: "background 0.15s ease",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Назад
            </button>
          )}

          <button
            type="button"
            className="cta-btn"
            disabled={
              isSubmitting ||
              (step === 1 && !canProceedStep1) ||
              (step === 2 && !canProceedStep2) ||
              (step === 3 && !canProceedStep3)
            }
            onClick={step === 3 ? handleFinish : goNext}
            style={{
              flex: 1,
              padding: "14px 24px",
              background: "linear-gradient(135deg, #FCAE91, #F9A08B)",
              border: "none",
              borderRadius: "12px",
              fontSize: "15px",
              fontWeight: 700,
              color: "white",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              letterSpacing: "-0.1px",
              boxShadow: "0 8px 24px rgba(252,174,145,0.3)",
              transition: "all 0.2s ease",
              fontFamily: "inherit",
              opacity: (
                isSubmitting ||
                (step === 1 && !canProceedStep1) ||
                (step === 2 && !canProceedStep2) ||
                (step === 3 && !canProceedStep3)
              ) ? 0.45 : 1,
            }}
          >
            {isSubmitting ? "Сохраняем..." : step === 3 ? "Начать работу →" : "Продолжить"}
            {step !== 3 && (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4L10 8L6 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        </div>

        {/* Step counter */}
        <p style={{
          textAlign: "center",
          fontSize: "11px",
          color: "#CCCCCC",
          margin: "10px 0 0",
          fontWeight: 500,
        }}>
          {step}/3 — займёт меньше 2 минут
        </p>
      </div>
    </div>
  );
}