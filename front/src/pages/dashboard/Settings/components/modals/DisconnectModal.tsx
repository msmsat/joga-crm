import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button, GhostButton, ModalBody, ModalFooter, ModalHeader, ModalShell,
} from "../../../../../components/ui/index";

interface DisconnectModalProps {
  name: string;
  capabilities: string[];
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

// Обязательное предупреждение о последствиях перед отключением (эпик 6, задача 5):
// состав списка — из capabilities ответа API, не захардкожен здесь. Кнопка
// «Отключить» активна только с отмеченным чекбоксом «Я понимаю последствия».
export default function DisconnectModal({ name, capabilities, loading, onClose, onConfirm }: DisconnectModalProps) {
  const { t } = useTranslation("settings");
  const [understood, setUnderstood] = useState(false);

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title={t("integrations.disconnect.title", { name })} />
      <ModalBody>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--onyx)" }}>
          {t("integrations.disconnect.willStop")}
        </div>
        <ul style={{ margin: 0, paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {capabilities.map((cap) => (
            <li key={cap} style={{ fontSize: "13px", color: "var(--muted, #666)", lineHeight: 1.5 }}>
              {t(`integrations.capabilities.${cap}`)}
            </li>
          ))}
        </ul>

        <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer", marginTop: "4px" }}>
          <input
            type="checkbox"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
            style={{ marginTop: "2px", width: "16px", height: "16px", accentColor: "#D88C9A", cursor: "pointer" }}
          />
          <span style={{ fontSize: "13px", color: "var(--onyx)", fontWeight: 600 }}>
            {t("integrations.disconnect.checkbox")}
          </span>
        </label>
      </ModalBody>
      <ModalFooter>
        <GhostButton onClick={onClose}>{t("integrations.disconnect.cancel")}</GhostButton>
        <Button variant="danger" fullWidth loading={loading} disabled={!understood} onClick={onConfirm}>
          {t("integrations.disconnect.confirm")}
        </Button>
      </ModalFooter>
    </ModalShell>
  );
}
