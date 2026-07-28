import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "../../../../../components/ui/index";
import { OtpConfirmModal } from "./OtpConfirmModal";
import type { OtpAction } from "../../../../../api/auth/auth.types";

interface DangerZoneModalProps {
  action: Extract<OtpAction, "delete_data" | "delete_account">;
  title: string;
  consequences: string[];
  studioName: string;
  onClose: () => void;
  onConfirmed: (otpToken: string, confirmName: string) => void | Promise<void>;
}

// Шаг 1 для двух необратимых действий (wipe-data/delete-account) — список
// последствий + ручной ввод названия студии. Код с почты (OtpConfirmModal,
// шаг 2) подтверждает личность, набранное название — намерение.
export function DangerZoneModal({ action, title, consequences, studioName, onClose, onConfirmed }: DangerZoneModalProps) {
  const { t } = useTranslation("settings");
  const [confirmName, setConfirmName] = useState("");

  return (
    <OtpConfirmModal
      action={action}
      title={title}
      onClose={onClose}
      onConfirmed={(otpToken) => onConfirmed(otpToken, confirmName)}
      canContinue={confirmName.length > 0 && confirmName === studioName}
      continueLabel={t("security.otp.continue")}
      step1Body={
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {consequences.map((c) => (
              <li key={c} style={{ fontSize: "13px", color: "var(--text2, #666)", lineHeight: 1.5 }}>{c}</li>
            ))}
          </ul>
          <Input
            label={t("security.danger.confirmNameLabel", { name: studioName })}
            value={confirmName}
            onChange={setConfirmName}
            placeholder={studioName}
          />
        </div>
      }
    />
  );
}
