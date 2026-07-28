import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import "./Settings.css";

import { useBilling } from "./hooks/useBilling";

import { icons } from "./components/ui/SettingsIcons";
import SettingsNav from "./components/ui/SettingsNav";
import { useToast } from "../../../components/ui/index";

import GeneralTab from "./components/tabs/GeneralTab";
import AppearanceTab from "./components/tabs/AppearanceTab";
import NotificationsTab from "./components/tabs/NotificationsTab";
import BillingTab from "./components/tabs/BillingTab";
import SecurityTab from "./components/tabs/SecurityTab";
import IntegrationsTab from "./components/tabs/IntegrationsTab";
import DataTab from "./components/tabs/DataTab";
import WorkspaceSelector from "./components/modals/WorkspaceSelector";

import type { Studio } from "./types";
import { INITIAL_STUDIOS_LIST } from "./constants";

export default function Settings() {
  const rightPanelRef = useRef<HTMLDivElement>(null);

  const { t } = useTranslation('settings');
  const toast = useToast();
  const billing = useBilling();
  const [searchParams] = useSearchParams();

  // Возврат из Google OAuth (эпик 6, задача 4) редиректит на
  // /dashboard/settings?tab=integrations&google=ok|denied|error — без этого
  // владелец увидел бы вкладку «Основные», а не результат подключения.
  const [activeSection, setActiveSection] = useState(() => searchParams.get("tab") ?? "general");
  const [isLoggedOut, setIsLoggedOut] = useState(false);
  const [studiosList, setStudiosList] = useState<Studio[]>(INITIAL_STUDIOS_LIST);

  useEffect(() => {
    rightPanelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeSection]);

  const navItems = [
    { id: "general", icon: icons.building, label: t('nav.general') },
    { id: "appearance", icon: icons.palette, label: t('nav.appearance') },
    { id: "notifications", icon: icons.bell, label: t('nav.notifications'), badge: 2 },
    { id: "billing", icon: icons.creditCard, label: t('nav.billing') },
    { id: "security", icon: icons.shield, label: t('nav.security') },
    { id: "integrations", icon: icons.link, label: t('nav.integrations') },
    { id: "data", icon: icons.database, label: t('nav.data') },
  ];

  const sectionContent: Record<string, React.ReactNode> = {
    general: <GeneralTab />,
    appearance: <AppearanceTab />,
    notifications: <NotificationsTab />,
    billing: <BillingTab {...billing} />,
    security: <SecurityTab />,
    integrations: <IntegrationsTab />,
    data: <DataTab />,
  };

  return (
    <>
      <div style={{ display: "flex", width: "100%", alignItems: "start", height: "100%", overflow: "hidden" }}>
        <SettingsNav
          sectionLabel={t('nav.sectionLabel')}
          navItems={navItems}
          activeSection={activeSection}
          onSelect={setActiveSection}
          logoutLabel={t('nav.logout')}
          onLogout={() => { setIsLoggedOut(true); toast.success(t('workspace.loggedOut')); }}
        />

        {/* ─── CONTENT ─── */}
        <div
          ref={rightPanelRef}
          style={{ flex: 1, padding: "32px 40px", width: "100%", maxWidth: "100%", boxSizing: "border-box", height: "100%", overflowY: "auto" }}
        >
          <div key={activeSection} className="settings-content-anim" style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {sectionContent[activeSection] ?? sectionContent["general"]}
          </div>
        </div>
      </div>

      {isLoggedOut && (
        <WorkspaceSelector
          studiosList={studiosList}
          setStudiosList={setStudiosList}
          onEnter={(name) => { setIsLoggedOut(false); toast.success(t('workspace.entered', { name })); }}
        />
      )}
    </>
  );
}
