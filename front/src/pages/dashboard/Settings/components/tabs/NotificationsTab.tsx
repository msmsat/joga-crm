import { useState } from "react";
import { icons } from "../ui/SettingsIcons";
import SectionHeader from "../ui/SectionHeader";
import PremiumButton from "../ui/PremiumButton";
import Toggle from "../ui/form/Toggle";
import InputRow from "../ui/form/InputRow";
import NotificationIllustration from "../illustrations/NotificationIllustration";
import type { NotificationsState } from "../../types";

interface NotificationsTabProps {
  savedStates: Record<string, boolean>;
  triggerSave: (key: string, msg: string) => void;
}

export default function NotificationsTab({ savedStates, triggerSave }: NotificationsTabProps) {
  const [notifications, setNotifications] = useState<NotificationsState>({
    email: true, sms: false, push: true, marketing: false,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.bell} title="Уведомления" subtitle="Настройте, как и когда получать оповещения" />
        <NotificationIllustration />
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "2px" }}>
          {[
            { key: "email" as const, label: "Email-уведомления", sub: "Новые записи, отмены, платежи" },
            { key: "sms" as const, label: "SMS-оповещения", sub: "Срочные уведомления на телефон" },
            { key: "push" as const, label: "Push-уведомления", sub: "Уведомления в браузере и приложении" },
            { key: "marketing" as const, label: "Маркетинговые рассылки", sub: "Обновления продукта, советы, акции" },
          ].map(({ key, label, sub }) => (
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
        <SectionHeader icon={icons.mail} title="Email для уведомлений" subtitle="Куда отправлять системные письма" />
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <InputRow label="Основной email" defaultValue="hello@studio.ru" type="email" />
          <InputRow label="Резервный email" placeholder="backup@studio.ru" type="email" />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <PremiumButton
              isSaved={savedStates['notifs']}
              onClick={() => triggerSave('notifs', 'Настройки уведомлений сохранены')}
              text="Сохранить"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
