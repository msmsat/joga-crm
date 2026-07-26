import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { icons } from "../ui/SettingsIcons";
import SectionHeader from "../ui/SectionHeader";
import Toggle from "../ui/form/Toggle";
import NotificationIllustration from "../illustrations/NotificationIllustration";
import type { NotificationsState } from "../../types";
import { authApi, ApiError } from "../../../../../api";
import { Button, Input, useToast } from "../../../../../components/ui/index";

export default function NotificationsTab() {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [notifications, setNotifications] = useState<NotificationsState>({
    email: true, sms: false, push: true, marketing: false,
  });

  const [tgId, setTgId] = useState("");
  const [isSavingTg, setIsSavingTg] = useState(false);
  const [primaryEmail, setPrimaryEmail] = useState("hello@studio.ru");
  const [backupEmail, setBackupEmail] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    authApi.getMe(controller.signal)
      .then(me => setTgId(me.tg_id ? String(me.tg_id) : ""))
      .catch(() => { /* 401 обрабатывает клиент; иначе поле остаётся пустым */ });
    return () => controller.abort();
  }, []);

  const handleSaveTg = async () => {
    const trimmed = tgId.trim();
    if (trimmed && !/^\d+$/.test(trimmed)) {
      toast.error(t('notifications.telegram.invalidChatId'));
      return;
    }
    setIsSavingTg(true);
    try {
      const me = await authApi.updateMe({ tg_id: trimmed ? Number(trimmed) : null });
      setTgId(me.tg_id ? String(me.tg_id) : "");
      toast.success(t('notifications.telegram.saved'));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t('notifications.telegram.saveFailed'));
    } finally {
      setIsSavingTg(false);
    }
  };

  const channels = [
    { key: "email" as const, label: t('notifications.channels.email.label'), sub: t('notifications.channels.email.sub') },
    { key: "sms" as const, label: t('notifications.channels.sms.label'), sub: t('notifications.channels.sms.sub') },
    { key: "push" as const, label: t('notifications.channels.push.label'), sub: t('notifications.channels.push.sub') },
    { key: "marketing" as const, label: t('notifications.channels.marketing.label'), sub: t('notifications.channels.marketing.sub') },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.bell} title={t('notifications.channels.title')} subtitle={t('notifications.channels.subtitle')} />
        <NotificationIllustration />
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "2px" }}>
          {channels.map(({ key, label, sub }) => (
            <div key={key} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px", borderRadius: "10px",
              background: notifications[key] ? "rgba(252,174,145,0.04)" : "transparent",
              transition: "background 0.2s ease",
            }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>{label}</div>
                <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "1px" }}>{sub}</div>
              </div>
              <Toggle checked={notifications[key]} onChange={() => setNotifications(p => ({ ...p, [key]: !p[key] }))} />
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.telegram} title={t('notifications.telegram.title')} subtitle={t('notifications.telegram.subtitle')} />
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <Input
            label={t('notifications.telegram.chatId')}
            placeholder={t('notifications.telegram.chatIdPh')}
            value={tgId}
            onChange={setTgId}
          />
          <div style={{ fontSize: "12px", color: "var(--muted)" }}>
            {t('notifications.telegram.hintBefore')}<strong>@userinfobot</strong>{t('notifications.telegram.hintAfter')}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button variant="primary" loading={isSavingTg} onClick={handleSaveTg}>{t('common:buttons.save')}</Button>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.mail} title={t('notifications.email.title')} subtitle={t('notifications.email.subtitle')} />
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <Input label={t('notifications.email.primary')} value={primaryEmail} onChange={setPrimaryEmail} type="email" />
          <Input label={t('notifications.email.backup')} placeholder={t('notifications.email.backupPh')} value={backupEmail} onChange={setBackupEmail} type="email" />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button variant="primary" onClick={() => toast.success(t('notifications.email.saved'))}>{t('common:buttons.save')}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
