import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, useToast } from "../../../../../components/ui/index";
import { authApi } from "../../../../../api/auth/auth.api";
import type { OtpAction } from "../../../../../api/auth/auth.types";
import { errorMessage } from "../../../../../api/errorMessage";

const RESEND_SECONDS = 60;
const CODE_LENGTH = 6;

interface OtpConfirmModalProps {
  action: OtpAction;
  title: string;
  onClose: () => void;
  onConfirmed: (otpToken: string) => void | Promise<void>;
  step1Body: React.ReactNode;      // содержимое шага 1 (поля/предупреждение) — без кнопок
  canContinue: boolean;            // включает кнопку продолжения на шаге 1
  continueLabel?: string;
}

// Один компонент на все опасные действия (смена пароля, danger zone, 2FA):
// шаг 1 — контент вызывающей стороны, шаг 2 — 6-значный код с общей логикой
// запроса/повтора/проверки. Так вместо четырёх мест для ошибки — одно.
export function OtpConfirmModal({ action, title, onClose, onConfirmed, step1Body, canContinue, continueLabel }: OtpConfirmModalProps) {
  const { t } = useTranslation("settings");
  const toast = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [codeError, setCodeError] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const requestCode = async () => {
    if (busy || !canContinue) return;
    setBusy(true);
    try {
      await authApi.requestOtp(action);
      setStep(2);
      setCode(Array(CODE_LENGTH).fill(""));
      setCodeError("");
      setResendIn(RESEND_SECONDS);
      setTimeout(() => inputsRef.current[0]?.focus(), 50);
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  };

  const setDigit = (i: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    setCode(prev => { const next = [...prev]; next[i] = digit; return next; });
    if (digit && i < CODE_LENGTH - 1) inputsRef.current[i + 1]?.focus();
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[i] && i > 0) inputsRef.current[i - 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH).split("");
    if (!digits.length) return;
    e.preventDefault();
    setCode(prev => {
      const next = [...prev];
      digits.forEach((d, idx) => { next[idx] = d; });
      return next;
    });
    inputsRef.current[Math.min(digits.length, CODE_LENGTH - 1)]?.focus();
  };

  const codeComplete = code.join("").length === CODE_LENGTH;

  const verify = async () => {
    if (!codeComplete || busy) return;
    setBusy(true);
    setCodeError("");
    try {
      const { otp_token } = await authApi.verifyOtp(action, code.join(""));
      await onConfirmed(otp_token);
      onClose();
    } catch (err) {
      setCodeError(errorMessage(err, t));
      setCode(Array(CODE_LENGTH).fill(""));
      inputsRef.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose} closeOnBackdrop={!busy}>
      <ModalHeader title={title} />
      <ModalBody>
        {step === 1 ? (
          step1Body
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p style={{ fontSize: "13px", color: "var(--text2, #666)", margin: 0 }}>
              {t("security.otp.sentHint")}
            </p>
            <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={el => { inputsRef.current[i] = el; }}
                  value={digit}
                  onChange={e => setDigit(i, e.target.value)}
                  onKeyDown={e => onKeyDown(i, e)}
                  onPaste={onPaste}
                  inputMode="numeric"
                  maxLength={1}
                  disabled={busy}
                  style={{
                    width: "42px", height: "52px", textAlign: "center", fontSize: "20px", fontWeight: 800,
                    borderRadius: "12px", border: `1.5px solid ${codeError ? "#D88C9A" : "rgba(var(--ink),0.12)"}`,
                    outline: "none", fontFamily: "Manrope, sans-serif", color: "var(--text, #1A1A1A)",
                    background: "var(--bg-card, #fff)",
                  }}
                />
              ))}
            </div>
            {codeError && <div style={{ fontSize: "12px", color: "#D88C9A", fontWeight: 600, textAlign: "center" }}>{codeError}</div>}
            <button
              type="button"
              onClick={requestCode}
              disabled={resendIn > 0 || busy}
              style={{
                background: "none", border: "none", fontSize: "12.5px", fontWeight: 700,
                color: resendIn > 0 ? "#AAA" : "var(--peach, #F9A08B)",
                cursor: resendIn > 0 ? "default" : "pointer", padding: 0, textAlign: "center",
              }}
            >
              {resendIn > 0 ? t("security.otp.resendIn", { count: resendIn }) : t("security.otp.resend")}
            </button>
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <GhostButton onClick={onClose}>{t("security.otp.cancel")}</GhostButton>
        <PrimaryButton
          onClick={step === 1 ? requestCode : verify}
          loading={busy}
          disabled={step === 1 ? !canContinue : !codeComplete}
        >
          {step === 1 ? (continueLabel ?? t("security.otp.sendCode")) : t("security.otp.confirm")}
        </PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}
