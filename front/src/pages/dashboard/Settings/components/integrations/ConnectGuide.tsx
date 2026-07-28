import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input } from "../../../../../components/ui/index";
import type { IntegrationType } from "../../../../../api/settings/settings.types";

interface ConnectGuideProps {
  type: IntegrationType;
  loading: boolean;
  onSubmit: (fields: Record<string, string>) => void;
  onGoogleConnect: () => void;
}

// Нумерованные шаги — откуда взять токен, а не голое поле «вставьте токен».
// Для Google шагов проходит сам Google (consent screen) — здесь только одна кнопка.
export default function ConnectGuide({ type, loading, onSubmit, onGoogleConnect }: ConnectGuideProps) {
  const { t } = useTranslation("settings");
  const steps = t(`integrations.guide.${type}.steps`, { returnObjects: true }) as string[];

  const [token, setToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [igUserId, setIgUserId] = useState("");

  const canSubmit =
    type === "telegram" ? token.trim().length > 0 :
    type === "whatsapp" ? token.trim().length > 0 && phoneNumberId.trim().length > 0 :
    type === "instagram" ? token.trim().length > 0 && igUserId.trim().length > 0 :
    true;

  const handleSubmit = () => {
    if (type === "telegram") onSubmit({ token });
    else if (type === "whatsapp") onSubmit({ token, phone_number_id: phoneNumberId, waba_id: wabaId });
    else if (type === "instagram") onSubmit({ token, ig_user_id: igUserId });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--onyx)", marginBottom: "8px" }}>
          {t("integrations.guide.howToTitle")}
        </div>
        <ol style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "5px" }}>
          {steps.map((step, i) => (
            <li key={i} style={{ fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.5 }}>{step}</li>
          ))}
        </ol>
      </div>

      {type === "telegram" && (
        <Input
          label={t("integrations.fields.telegramToken")}
          placeholder={t("integrations.fields.telegramTokenPh")}
          value={token}
          onChange={setToken}
          monospace
        />
      )}

      {type === "whatsapp" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <Input label={t("integrations.fields.whatsappToken")} placeholder={t("integrations.fields.whatsappTokenPh")} value={token} onChange={setToken} monospace />
          <Input label={t("integrations.fields.whatsappPhoneId")} placeholder={t("integrations.fields.whatsappPhoneIdPh")} value={phoneNumberId} onChange={setPhoneNumberId} />
          <Input label={t("integrations.fields.whatsappWabaId")} placeholder={t("integrations.fields.whatsappWabaIdPh")} value={wabaId} onChange={setWabaId} />
        </div>
      )}

      {type === "instagram" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <Input label={t("integrations.fields.instagramToken")} placeholder={t("integrations.fields.instagramTokenPh")} value={token} onChange={setToken} monospace />
          <Input label={t("integrations.fields.instagramUserId")} placeholder={t("integrations.fields.instagramUserIdPh")} value={igUserId} onChange={setIgUserId} />
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="primary"
          loading={loading}
          disabled={!canSubmit}
          onClick={type === "google_calendar" ? onGoogleConnect : handleSubmit}
        >
          {t("integrations.actions.connect")}
        </Button>
      </div>
    </div>
  );
}
