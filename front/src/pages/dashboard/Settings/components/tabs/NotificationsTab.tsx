import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { icons } from "../ui/SettingsIcons";
import SectionHeader from "../ui/SectionHeader";
import Toggle from "../ui/form/Toggle";
import { useMyNotifications } from "../../hooks/useMyNotifications";
import { authApi, ApiError } from "../../../../../api";
import { notificationsApi } from "../../../../../api/notifications";
import { queryKeys } from "../../../../../api/queryKeys";
import { errorMessage } from "../../../../../api/errorMessage";
import { Button, EmptyState, Input, useToast } from "../../../../../components/ui/index";
import type { NotificationSettings } from "../../../../../api/notifications/notifications.types";

const CHANNEL_KEYS = ["email", "telegram", "whatsapp"] as const;

export default function NotificationsTab() {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const qc = useQueryClient();

  const [tgId, setTgId] = useState("");
  const [isSavingTg, setIsSavingTg] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    authApi.getMe(controller.signal)
      .then(me => {
        setTgId(me.tg_id ? String(me.tg_id) : "");
        setIsOwner(me.role === "owner");
      })
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

  // Email для системных писем — те же поля, что уже реально работают в
  // /dashboard/notifications (ChannelsSidebar), здесь просто их собственная карточка.
  // GET/PATCH /settings/notifications — owner-only на бэке; для admin/trainer
  // не зовём вовсе (иначе гарантированный 403), карточка им не показывается.
  const emailQ = useQuery({ queryKey: queryKeys.notificationSettings, queryFn: () => notificationsApi.getSettings(), enabled: isOwner });
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [backupEmail, setBackupEmail] = useState("");
  const [emailSynced, setEmailSynced] = useState<NotificationSettings | null>(null);
  if (emailQ.data && emailQ.data !== emailSynced) {
    setEmailSynced(emailQ.data);
    setPrimaryEmail(emailQ.data.primary_email ?? "");
    setBackupEmail(emailQ.data.backup_email ?? "");
  }
  const saveEmail = useMutation({
    mutationFn: () => notificationsApi.updateSettings({ primary_email: primaryEmail || null, backup_email: backupEmail || null }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.notificationSettings, data);
      toast.success(t('notifications.email.saved'));
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });

  const myPrefs = useMyNotifications();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.bell} title={t('notifications.myPrefs.title')} subtitle={t('notifications.myPrefs.subtitle')} />
        <div style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "16px" }}>{t('notifications.myPrefs.hint')}</div>
        {!myPrefs.isLoading && myPrefs.data?.events.length === 0 && (
          <EmptyState size="sm" title={t('notifications.myPrefs.empty')} />
        )}
        {(myPrefs.data?.events.length ?? 0) > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {myPrefs.data?.events.map(row => (
              <div key={row.event_id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px", borderRadius: "10px", gap: "16px",
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--onyx)" }}>
                    {t(`events.${row.event_id}.title`, { ns: 'notifications' })}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "1px" }}>
                    {t(`events.${row.event_id}.desc`, { ns: 'notifications' })}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "16px", flexShrink: 0 }}>
                  {CHANNEL_KEYS.map(ch => (
                    <label key={ch} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
                        {t(`notifications.myPrefs.channels.${ch}`)}
                      </span>
                      <Toggle
                        checked={row.channels[ch] ?? false}
                        onChange={() => myPrefs.toggle.mutate({ event_id: row.event_id, channel_key: ch, is_enabled: !row.channels[ch] })}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
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

      {isOwner && (
        <div className="card" style={{ padding: "28px" }}>
          <SectionHeader icon={icons.mail} title={t('notifications.email.title')} subtitle={t('notifications.email.subtitle')} />
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <Input label={t('notifications.email.primary')} value={primaryEmail} onChange={setPrimaryEmail} type="email" />
            <Input label={t('notifications.email.backup')} placeholder={t('notifications.email.backupPh')} value={backupEmail} onChange={setBackupEmail} type="email" />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Button variant="primary" loading={saveEmail.isPending} onClick={() => saveEmail.mutate()}>{t('common:buttons.save')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
