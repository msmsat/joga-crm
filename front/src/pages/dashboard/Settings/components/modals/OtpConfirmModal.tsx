import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, useToast } from "../../../../../components/ui/index";
import { CodeInput, CODE_LENGTH } from "./CodeInput";
import { ResendLink } from "./ResendLink";
import { authApi } from "../../../../../api/auth/auth.api";
import type { OtpAction } from "../../../../../api/auth/auth.types";
import { errorMessage } from "../../../../../api/errorMessage";

const RESEND_SECONDS = 60;

interface OtpConfirmModalProps {
  action: OtpAction;
  title: string;
  onClose: () => void;
  onConfirmed: (otpToken: string) => void | Promise<void>;
  step1Body: React.ReactNode;      // содержимое шага 1 (поля/предупреждение) — без кнопок
  canContinue: boolean;            // включает кнопку продолжения на шаге 1
  continueLabel?: string;
  footerExtra?: React.ReactNode;   // ссылка под кнопками на шаге 1 («Забыли пароль?»)
}

// Один компонент на все опасные действия (смена пароля, danger zone, 2FA):
// шаг 1 — контент вызывающей стороны, шаг 2 — 6-значный код с общей логикой
// запроса/повтора/проверки. Так вместо четырёх мест для ошибки — одно.
export function OtpConfirmModal({ action, title, onClose, onConfirmed, step1Body, canContinue, continueLabel, footerExtra }: OtpConfirmModalProps) {
  const { t } = useTranslation("settings");
  const toast = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [codeError, setCodeError] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [focusKey, setFocusKey] = useState(0);

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
      setFocusKey(k => k + 1);
    } catch (err) {
      toast.error(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
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
      setFocusKey(k => k + 1);
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
            <p style={{ fontSize: "13px", color: "var(--text2, #666)", margin: 0, textAlign: "center", lineHeight: 1.55 }}>
              {t("security.otp.sentHint")}
            </p>
            <CodeInput code={code} onChange={setCode} error={Boolean(codeError)} disabled={busy} focusKey={focusKey} />
            {codeError && <div style={{ fontSize: "12px", color: "#D88C9A", fontWeight: 600, textAlign: "center" }}>{codeError}</div>}
            <ResendLink secondsLeft={resendIn} disabled={busy} onResend={requestCode} />
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
          <div style={{ display: "flex", gap: "10px" }}>
            <GhostButton onClick={onClose}>{t("security.otp.cancel")}</GhostButton>
            <PrimaryButton
              onClick={step === 1 ? requestCode : verify}
              loading={busy}
              disabled={step === 1 ? !canContinue : !codeComplete}
            >
              {step === 1 ? (continueLabel ?? t("security.otp.sendCode")) : t("security.otp.confirm")}
            </PrimaryButton>
          </div>
          {step === 1 && footerExtra}
        </div>
      </ModalFooter>
    </ModalShell>
  );
}
