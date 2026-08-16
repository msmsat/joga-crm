import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAiIntent } from "../../../hooks/useAiIntent";
import "./Settings.css";

import { useBilling } from "./hooks/useBilling";
import { getStudioRole } from "../../../utils/auth";

import { icons } from "./components/ui/SettingsIcons";
import SettingsNav from "./components/ui/SettingsNav";

import GeneralTab from "./components/tabs/GeneralTab";
import AppearanceTab from "./components/tabs/AppearanceTab";
import NotificationsTab from "./components/tabs/NotificationsTab";
import BillingTab from "./components/tabs/BillingTab";
import SecurityTab from "./components/tabs/SecurityTab";
import IntegrationsTab from "./components/tabs/IntegrationsTab";
import DataTab from "./components/tabs/DataTab";

export default function Settings() {
  const rightPanelRef = useRef<HTMLDivElement>(null);

  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const billing = useBilling();
  const [searchParams] = useSearchParams();

  // ТЗ 2.13: владелец — всё, администратор и тренер — только персональные вкладки.
  // Студийные разделы (реквизиты студии, тариф, интеграции, экспорт/удаление
  // данных) им и на сервере закрыты — показывать вкладку, которая гарантированно
  // отдаёт 403, незачем.
  const isOwner = getStudioRole() === "owner";
  const OWNER_ONLY = ["general", "billing", "integrations", "data"];

  // Возврат из Google OAuth (эпик 6, задача 4) редиректит на
  // /dashboard/settings?tab=integrations&google=ok|denied|error — без этого
  // владелец увидел бы вкладку «Основные», а не результат подключения.
  const [activeSection, setActiveSection] = useState(() => searchParams.get("tab") ?? (isOwner ? "general" : "appearance"));

  useEffect(() => {
    rightPanelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeSection]);

  // Ассистент: /dashboard/settings?tab=security&ai=settings.section (эпик AI-6,
  // задача 9). Вкладку открывает ?tab= при первом рендере — интенту остаётся
  // подтвердить выбор и увести взгляд наверх длинной страницы.
  useAiIntent('settings.section', () => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab) setActiveSection(tab);
    rightPanelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  });

  const navItems = [
    { id: "general", icon: icons.building, label: t('nav.general') },
    { id: "appearance", icon: icons.palette, label: t('nav.appearance') },
    { id: "notifications", icon: icons.bell, label: t('nav.notifications'), badge: 2 },
    { id: "billing", icon: icons.creditCard, label: t('nav.billing') },
    { id: "security", icon: icons.shield, label: t('nav.security') },
    { id: "integrations", icon: icons.link, label: t('nav.integrations') },
    { id: "data", icon: icons.database, label: t('nav.data') },
  ].filter(item => isOwner || !OWNER_ONLY.includes(item.id));

  const sectionContent: Record<string, React.ReactNode> = {
    general: <GeneralTab />,
    appearance: <AppearanceTab />,
    notifications: <NotificationsTab />,
    billing: <BillingTab {...billing} />,
    security: <SecurityTab />,
    integrations: <IntegrationsTab />,
    data: <DataTab />,
  };

  // ?tab= из адресной строки — тоже вход: без этой проверки владелец мог бы
  // прислать админу ссылку на ?tab=data, и тот увидел бы чужую вкладку.
  const section = navItems.some(i => i.id === activeSection) ? activeSection : navItems[0].id;

  return (
    <div className="set-layout" style={{ display: "flex", width: "100%", alignItems: "start", height: "100%", overflow: "hidden" }}>
      <SettingsNav
        sectionLabel={t('nav.sectionLabel')}
        navItems={navItems}
        activeSection={section}
        onSelect={setActiveSection}
        logoutLabel={t('nav.logout')}
        onLogout={() => navigate('/select-crm')}
      />

      {/* ─── CONTENT ─── */}
      <div
        ref={rightPanelRef}
        className="set-content"
        style={{ flex: 1, minWidth: 0, padding: "calc(var(--card-pad) + 8px) calc(var(--card-pad) + 16px)", width: "100%", maxWidth: "100%", boxSizing: "border-box", height: "100%", overflowY: "auto" }}
      >
        <div key={section} className="settings-content-anim" style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          {sectionContent[section]}
        </div>
      </div>
    </div>
  );
}
