import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Input, useToast } from "../../../../../components/ui/index";
import { OtpConfirmModal } from "./OtpConfirmModal";
import { ResetPasswordModal } from "./ResetPasswordModal";
import { authApi } from "../../../../../api/auth/auth.api";
import { queryKeys } from "../../../../../api/queryKeys";
import { useMe } from "../../../../../hooks/useMe";
import { clearActiveToken, setActiveToken } from "../../../../../utils/auth";

interface ChangePasswordModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

// EPIC 5, задача 4/8: двухшаговая модалка на общем OtpConfirmModal —
// шаг 1 (этот компонент) собирает текущий/новый пароль, шаг 2 (код) уже
// встроен в OtpConfirmModal. Забыл текущий пароль — уходим в
// ResetPasswordModal: там подтверждение кодом вместо старого пароля.
export function ChangePasswordModal({ onClose, onSuccess }: ChangePasswordModalProps) {
  const { t } = useTranslation("settings");
  const toast = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [repeatTouched, setRepeatTouched] = useState(false);
  const [forgot, setForgot] = useState(false);

  const mismatch = repeatTouched && repeat.length > 0 && repeat !== newPassword;
  const canContinue =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword !== currentPassword &&
    repeat === newPassword;

  const handleConfirmed = async (otpToken: string) => {
    await authApi.changePassword({ current_password: currentPassword, new_password: newPassword }, otpToken);
    toast.success(t("security.password.changed"));
    onSuccess();
  };

  if (forgot) {
    return (
      <ResetPasswordModal
        email={me?.email ?? ""}
        onClose={() => setForgot(false)}
        onSuccess={(accessToken) => {
          // Прежний токен отозван вместе с остальными сессиями, но бэк выдал
          // новый — подменяем его на месте, и человек остаётся в своей студии.
          // Токена нет только если у аккаунта не нашлось активной студии —
          // тогда уводим на вход, продолжать всё равно не с чем.
          if (accessToken) {
            setActiveToken(accessToken);
            // Список сессий стал другим: старые отозваны, текущая — новая.
            qc.invalidateQueries({ queryKey: queryKeys.sessions });
            onClose();
          } else {
            clearActiveToken();
            onClose();
            navigate("/login");
          }
        }}
      />
    );
  }

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
          <Input
            label={t("security.password.repeat")}
            type="password"
            value={repeat}
            onChange={setRepeat}
            onBlur={() => setRepeatTouched(true)}
            placeholder={t("security.password.repeatPh")}
            error={mismatch ? t("security.password.mismatch") : undefined}
          />
        </div>
      }
      footerExtra={
        <button
          type="button"
          onClick={() => setForgot(true)}
          style={{
            background: "none", border: "none", padding: 0, width: "100%", textAlign: "center",
            fontSize: "12.5px", fontWeight: 700, fontFamily: "Manrope, sans-serif",
            color: "var(--peach, #F9A08B)", cursor: "pointer",
          }}
        >
          {t("security.password.forgot")}
        </button>
      }
    />
  );
}
