import { useTranslation } from "react-i18next";

interface ResendLinkProps {
  secondsLeft: number;
  disabled?: boolean;
  onResend: () => void;
}

// «Отправить код заново» с обратным отсчётом. Общая для подтверждения опасных
// действий и восстановления пароля — тексты и таймер в одном месте.
export function ResendLink({ secondsLeft, disabled, onResend }: ResendLinkProps) {
  const { t } = useTranslation("settings");
  const locked = secondsLeft > 0 || disabled;

  return (
    <button
      type="button"
      onClick={onResend}
      disabled={locked}
      style={{
        background: "none", border: "none", padding: 0, textAlign: "center",
        fontSize: "12.5px", fontWeight: 700, fontFamily: "Manrope, sans-serif",
        color: locked ? "var(--text3, #AAA)" : "var(--peach, #F9A08B)",
        cursor: locked ? "default" : "pointer", transition: "color 0.2s",
      }}
    >
      {secondsLeft > 0 ? t("security.otp.resendIn", { count: secondsLeft }) : t("security.otp.resend")}
    </button>
  );
}
