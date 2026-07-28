import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input, useToast } from "../../../../../components/ui/index";
import { OtpConfirmModal } from "./OtpConfirmModal";
import { authApi } from "../../../../../api/auth/auth.api";

interface ChangePasswordModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

// EPIC 5, задача 4/8: двухшаговая модалка на общем OtpConfirmModal —
// шаг 1 (этот компонент) собирает текущий/новый пароль, шаг 2 (код) уже
// встроен в OtpConfirmModal.
export function ChangePasswordModal({ onClose, onSuccess }: ChangePasswordModalProps) {
  const { t } = useTranslation("settings");
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const canContinue = currentPassword.length > 0 && newPassword.length >= 8 && newPassword !== currentPassword;

  const handleConfirmed = async (otpToken: string) => {
    await authApi.changePassword({ current_password: currentPassword, new_password: newPassword }, otpToken);
    toast.success(t("security.password.changed"));
    onSuccess();
  };

  return (
    <OtpConfirmModal
      action="change_password"
      title={t("security.password.title")}
      onClose={onClose}
      onConfirmed={handleConfirmed}
      canContinue={canContinue}
      continueLabel={t("security.otp.sendCode")}
      step1Body={
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <Input
            label={t("security.password.current")}
            type="password"
            value={currentPassword}
            onChange={setCurrentPassword}
            placeholder={t("security.password.currentPh")}
          />
          <Input
            label={t("security.password.new")}
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            placeholder={t("security.password.newPh")}
          />
        </div>
      }
    />
  );
}
