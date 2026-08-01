import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, Input, useToast } from "../../../../../components/ui/index";
import { CodeInput, CODE_LENGTH } from "./CodeInput";
import { ResendLink } from "./ResendLink";
import { authApi } from "../../../../../api/auth/auth.api";
import { ApiError } from "../../../../../api/client";
import { errorMessage } from "../../../../../api/errorMessage";

const RESEND_SECONDS = 60;
const TOTAL_STEPS = 3;

interface ResetPasswordModalProps {
  email: string;
  onClose: () => void;
  /** Сброс отзывает прежние сессии и выдаёт новый токен — его надо сделать активным. */
  onSuccess: (accessToken: string | null) => void;
}

// Правила совпадают с validate_strong_password на бэке: показываем их живыми,
// чтобы не ловить 422 после трёх шагов.
function passwordRules(value: string) {
  return [
    { key: "len", ok: value.length >= 8 },
    { key: "letter", ok: /[A-Za-zА-Яа-я]/.test(value) },
    { key: "digit", ok: /[0-9]/.test(value) },
    { key: "simple", ok: value.length > 0 && !/(.)\1{2,}/.test(value) && !/(123|234|345|456|567|678|789|890|qwe|wer|ert|asd|sdf|zxc)/.test(value.toLowerCase()) },
  ];
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 2)}***@${domain}`;
}

// «Забыли пароль?» изнутри аккаунта: код на почту → ввод кода → новый пароль
// с повтором. Старый пароль не спрашиваем — в этом весь смысл сценария;
// подтверждением владения служит код, и проверяет его сервер (POST
// /auth/reset-password), а не этот компонент.
export function ResetPasswordModal({ email, onClose, onSuccess }: ResetPasswordModalProps) {
  const { t } = useTranslation("settings");
  const toast = useToast();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [codeError, setCodeError] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [focusKey, setFocusKey] = useState(0);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [repeatTouched, setRepeatTouched] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const rules = passwordRules(password);
  const passwordOk = rules.every(r => r.ok);
  const mismatch = repeatTouched && repeat.length > 0 && repeat !== password;
  const codeComplete = code.join("").length === CODE_LENGTH;

  const sendCode = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await authApi.forgotPassword({ email });
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

  const save = async () => {
    if (busy || !passwordOk || repeat !== password) return;
    setBusy(true);
    setPasswordError("");
    try {
      const { access_token } = await authApi.resetPassword({ email, code: code.join(""), new_password: password });
      toast.success(t("security.password.resetDone"));
      onSuccess(access_token);
    } catch (err) {
      // 400 — код не подошёл (истёк, исчерпаны попытки): возвращаем на шаг кода,
      // иначе пользователь правит пароль, который ни при чём.
      if (err instanceof ApiError && err.status === 400) {
        setCode(Array(CODE_LENGTH).fill(""));
        setCodeError(errorMessage(err, t));
        setStep(2);
        setFocusKey(k => k + 1);
      } else {
        setPasswordError(errorMessage(err, t));
      }
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    if (busy) return;
    if (step === 3) { setStep(2); setFocusKey(k => k + 1); }
    else if (step === 2) setStep(1);
  };

  const primary = {
    1: { label: t("security.password.sendCode"), onClick: sendCode, disabled: false },
    2: { label: t("security.otp.continue"), onClick: () => { setCodeError(""); setStep(3); }, disabled: !codeComplete },
    3: { label: t("security.password.save"), onClick: save, disabled: !passwordOk || repeat !== password },
  }[step];

  return (
    <ModalShell onClose={onClose} closeOnBackdrop={!busy} maxWidth="480px">
      <ModalHeader
        title={t("security.password.resetTitle")}
        subtitle={t(`security.password.step${step}Sub`, { email: maskEmail(email) })}
      />

      {/* Прогресс по шагам: три сегмента, пройденные заливаются персиковым */}
      <div style={{ display: "flex", gap: "6px", padding: "14px 24px 0" }}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <div
            key={i}
            style={{
              flex: 1, height: "4px", borderRadius: "999px",
              background: i < step ? "linear-gradient(90deg, #FCAE91, #F9A08B)" : "rgba(var(--ink),0.07)",
              boxShadow: i < step ? "0 2px 8px rgba(252,174,145,0.35)" : "none",
              transition: "all 0.35s cubic-bezier(0.34,1.2,0.64,1)",
            }}
          />
        ))}
      </div>

      <ModalBody>
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "8px 0 4px" }}>
            <div style={{
              width: "72px", height: "72px", borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(252,174,145,0.22), rgba(249,160,139,0.10))",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 10px 28px rgba(252,174,145,0.22)",
            }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#F9A08B" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="3" />
                <path d="M2.5 7L12 13L21.5 7" />
              </svg>
            </div>
            <p style={{ fontSize: "13.5px", color: "var(--text2, #666)", margin: 0, textAlign: "center", lineHeight: 1.6 }}>
              {t("security.password.resetIntro")}
            </p>
            <div style={{
              padding: "10px 16px", borderRadius: "12px", background: "rgba(var(--ink),0.03)",
              fontSize: "13px", fontWeight: 700, color: "var(--text, #1A1A1A)",
            }}>
              {email}
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <p style={{ fontSize: "13px", color: "var(--text2, #666)", margin: 0, textAlign: "center", lineHeight: 1.55 }}>
              {t("security.otp.sentHint")}
            </p>
            <CodeInput code={code} onChange={setCode} error={Boolean(codeError)} disabled={busy} focusKey={focusKey} />
            {codeError && <div style={{ fontSize: "12px", color: "#D88C9A", fontWeight: 600, textAlign: "center" }}>{codeError}</div>}
            <ResendLink secondsLeft={resendIn} disabled={busy} onResend={sendCode} />
          </div>
        )}

        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <Input
              label={t("security.password.new")}
              type="password"
              value={password}
              onChange={v => { setPassword(v); setPasswordError(""); }}
              placeholder={t("security.password.newPh")}
              error={passwordError || undefined}
            />
            <Input
              label={t("security.password.repeat")}
              type="password"
              value={repeat}
              onChange={setRepeat}
              onBlur={() => setRepeatTouched(true)}
              placeholder={t("security.password.repeatPh")}
              error={mismatch ? t("security.password.mismatch") : undefined}
            />

            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", paddingTop: "2px" }}>
              {rules.map(rule => (
                <span
                  key={rule.key}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "6px",
                    fontSize: "11.5px", fontWeight: 600,
                    color: rule.ok ? "#5A9A65" : "var(--text3, #AAA)",
                    transition: "color 0.2s",
                  }}
                >
                  <span style={{
                    width: "15px", height: "15px", borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: rule.ok ? "rgba(163,201,168,0.22)" : "rgba(var(--ink),0.06)",
                    transition: "background 0.2s",
                  }}>
                    {rule.ok && (
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#5A9A65" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="2 6 5 9 10 3" />
                      </svg>
                    )}
                  </span>
                  {t(`security.password.rules.${rule.key}`)}
                </span>
              ))}
            </div>

            <p style={{ fontSize: "11.5px", color: "var(--text3, #AAA)", margin: 0, lineHeight: 1.55 }}>
              {t("security.password.resetLogoutHint")}
            </p>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <GhostButton onClick={step === 1 ? onClose : back}>
          {step === 1 ? t("security.otp.cancel") : t("security.password.back")}
        </GhostButton>
        <PrimaryButton onClick={primary.onClick} loading={busy} disabled={primary.disabled}>
          {primary.label}
        </PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}
