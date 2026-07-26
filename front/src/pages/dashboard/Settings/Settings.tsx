import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import "./Settings.css";

import { useSecurity } from "./hooks/useSecurity";
import { useBilling } from "./hooks/useBilling";
import { useIntegrations } from "./hooks/useIntegrations";
import { useTeam } from "./hooks/useTeam";

import { AddEmployeeModal } from "../Staff/components/modals/AddEmployeeModal";
import EditStaffModal from "../../../components/modals/EditStaffModal";

import { icons } from "./components/ui/SettingsIcons";
import SettingsNav from "./components/ui/SettingsNav";
import { ConfirmModal, useToast } from "../../../components/ui/index";

import GeneralTab from "./components/tabs/GeneralTab";
import HoursTab from "./components/tabs/HoursTab";
import TeamTab from "./components/tabs/TeamTab";
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
  const security = useSecurity();
  const billing = useBilling();
  const integrations = useIntegrations();

  const [activeSection, setActiveSection] = useState("general");
  const [twoFa, setTwoFa] = useState(false);
  const [isLoggedOut, setIsLoggedOut] = useState(false);
  const [studiosList, setStudiosList] = useState<Studio[]>(INITIAL_STUDIOS_LIST);

  // Адаптер старого useSettingsToast поверх общего Toast-кита:
  // savedStates даёт кнопкам «Сохранено»-состояние, сообщения идут в общий тост.
  const [savedStates, setSavedStates] = useState<Record<string, boolean>>({});
  const triggerToast = (msg: string) => toast.success(msg);
  const triggerSave = (key: string, msg: string) => {
    setSavedStates(p => ({ ...p, [key]: true }));
    toast.success(msg);
    setTimeout(() => setSavedStates(p => ({ ...p, [key]: false })), 2000);
  };
  const team = useTeam(triggerToast, triggerSave);

  useEffect(() => {
    rightPanelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeSection]);

  const navItems = [
    { id: "general", icon: icons.building, label: t('nav.general') },
    { id: "hours", icon: icons.calendar, label: t('nav.hours') },
    { id: "appearance", icon: icons.palette, label: t('nav.appearance') },
    { id: "notifications", icon: icons.bell, label: t('nav.notifications'), badge: 2 },
    { id: "team", icon: icons.users, label: t('nav.team') },
    { id: "billing", icon: icons.creditCard, label: t('nav.billing') },
    { id: "security", icon: icons.shield, label: t('nav.security') },
    { id: "integrations", icon: icons.link, label: t('nav.integrations') },
    { id: "data", icon: icons.database, label: t('nav.data') },
  ];

  const sectionContent: Record<string, React.ReactNode> = {
    general: <GeneralTab />,
    hours: <HoursTab savedStates={savedStates} triggerSave={triggerSave} />,
    appearance: <AppearanceTab />,
    notifications: <NotificationsTab />,
    team: (
      <TeamTab
        teamData={team.teamData}
        expandedRole={team.expandedRole}
        setExpandedRole={team.setExpandedRole}
        permissionsMatrix={team.permissionsMatrix}
        handlePermissionToggle={team.handlePermissionToggle}
        onAddStaff={() => team.setIsAddStaffOpen(true)}
        onEditStaff={(member) => { team.setActiveEditStaff(member); team.setIsEditStaffOpen(true); }}
        savedStates={savedStates}
        triggerSave={triggerSave}
      />
    ),
    billing: <BillingTab {...billing} />,
    security: (
      <SecurityTab
        secExpanded={security.secExpanded}
        setSecExpanded={security.setSecExpanded}
        setSecModal={security.setSecModal}
        activeSessions={security.activeSessions}
        apiTokens={security.apiTokens}
        newTokenName={security.newTokenName}
        setNewTokenName={security.setNewTokenName}
        terminateSession={security.terminateSession}
        revokeToken={security.revokeToken}
        generateToken={security.generateToken}
        twoFa={twoFa}
        setTwoFa={setTwoFa}
      />
    ),
    integrations: (
      <IntegrationsTab
        expandedIntegration={integrations.expandedIntegration}
        setExpandedIntegration={integrations.setExpandedIntegration}
        integrationsConfig={integrations.integrationsConfig}
        updateIntegrationField={integrations.updateIntegrationField}
        toggleIntegrationConnect={integrations.toggleIntegrationConnect}
      />
    ),
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

      <AddEmployeeModal
        isOpen={team.isAddStaffOpen}
        onClose={() => team.setIsAddStaffOpen(false)}
        onSuccess={team.handleAddStaffSuccess}
      />

      {team.activeEditStaff && (
        <EditStaffModal
          isOpen={team.isEditStaffOpen}
          staff={team.activeEditStaff}
          onClose={() => team.setIsEditStaffOpen(false)}
          onSave={team.handleEditStaffSave}
          onDelete={team.handleEditStaffDelete}
        />
      )}

      {(security.secModal === "deleteData" || security.secModal === "deleteAccount") && (
        <ConfirmModal
          danger
          title={security.secModal === "deleteAccount" ? t('security.danger.deleteAccount.title') : t('security.danger.wipe.title')}
          message={security.secModal === "deleteAccount" ? t('security.danger.deleteAccount.sub') : t('security.danger.wipe.sub')}
          confirmText={security.secModal === "deleteAccount" ? t('security.danger.deleteAccount.action') : t('security.danger.wipe.action')}
          onClose={() => security.setSecModal(null)}
          onConfirm={() => {
            toast.success(security.secModal === "deleteData"
              ? t('security.danger.wipe.toast')
              : t('security.danger.deleteAccount.toast'));
          }}
        />
      )}

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
