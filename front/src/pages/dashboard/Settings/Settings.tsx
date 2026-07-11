import { useState, useEffect, useRef } from "react";
import AddStaffModal from "../../../components/modals/AddStaffModal";
import EditStaffModal from "../../../components/modals/EditStaffModal";

import { useSettingsToast } from "./hooks/useSettingsToast";
import { useTeam } from "./hooks/useTeam";
import { useSecurity } from "./hooks/useSecurity";
import { useBilling } from "./hooks/useBilling";
import { useIntegrations } from "./hooks/useIntegrations";

import { icons } from "./components/ui/SettingsIcons";
import Toast from "./components/ui/Toast";

import GeneralTab from "./components/tabs/GeneralTab";
import HoursTab from "./components/tabs/HoursTab";
import AppearanceTab from "./components/tabs/AppearanceTab";
import NotificationsTab from "./components/tabs/NotificationsTab";
import TeamTab from "./components/tabs/TeamTab";
import BillingTab from "./components/tabs/BillingTab";
import SecurityTab from "./components/tabs/SecurityTab";
import IntegrationsTab from "./components/tabs/IntegrationsTab";
import DataTab from "./components/tabs/DataTab";
import WorkspaceSelector from "./components/modals/WorkspaceSelector";
import DeleteDataModal from "./components/modals/DeleteDataModal";

import type { Studio } from "./types";
import { INITIAL_STUDIOS_LIST } from "./constants";

export default function Settings() {
  const rightPanelRef = useRef<HTMLDivElement>(null);

  const { toast, triggerToast, savedStates, triggerSave } = useSettingsToast();
  const team = useTeam(triggerToast, triggerSave);
  const security = useSecurity(triggerToast);
  const billing = useBilling(triggerToast);
  const integrations = useIntegrations(triggerSave, triggerToast);

  const [activeSection, setActiveSection] = useState("general");
  const [twoFa, setTwoFa] = useState(false);
  const [isLoggedOut, setIsLoggedOut] = useState(false);
  const [studiosList, setStudiosList] = useState<Studio[]>(INITIAL_STUDIOS_LIST);

  useEffect(() => {
    rightPanelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeSection]);

  const navItems = [
    { id: "general", icon: icons.building, label: "Основные" },
    { id: "hours", icon: icons.calendar, label: "Рабочие часы" },
    { id: "appearance", icon: icons.palette, label: "Внешний вид" },
    { id: "notifications", icon: icons.bell, label: "Уведомления", badge: 2 },
    { id: "team", icon: icons.users, label: "Команда" },
    { id: "billing", icon: icons.creditCard, label: "Подписка" },
    { id: "security", icon: icons.shield, label: "Безопасность" },
    { id: "integrations", icon: icons.link, label: "Интеграции" },
    { id: "data", icon: icons.database, label: "Данные" },
  ];

  const sectionContent: Record<string, React.ReactNode> = {
    general: <GeneralTab savedStates={savedStates} triggerSave={triggerSave} triggerToast={triggerToast} />,
    hours: <HoursTab savedStates={savedStates} triggerSave={triggerSave} />,
    appearance: <AppearanceTab />,
    notifications: <NotificationsTab savedStates={savedStates} triggerSave={triggerSave} />,
    team: (
      <TeamTab
        teamData={team.teamData}
        expandedRole={team.expandedRole}
        setExpandedRole={team.setExpandedRole}
        permissionsMatrix={team.permissionsMatrix}
        handlePermissionToggle={team.handlePermissionToggle}
        onAddStaff={() => team.setIsAddStaffOpen(true)}
        onEditStaff={(member: any) => { team.setActiveEditStaff(member); team.setIsEditStaffOpen(true); }}
        savedStates={savedStates}
        triggerSave={triggerSave}
      />
    ),
    billing: <BillingTab {...billing} savedStates={savedStates} triggerSave={triggerSave} />,
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
        triggerToast={triggerToast}
      />
    ),
    integrations: (
      <IntegrationsTab
        expandedIntegration={integrations.expandedIntegration}
        setExpandedIntegration={integrations.setExpandedIntegration}
        integrationsConfig={integrations.integrationsConfig}
        updateIntegrationField={integrations.updateIntegrationField}
        toggleIntegrationConnect={integrations.toggleIntegrationConnect}
        savedStates={savedStates}
      />
    ),
    data: <DataTab triggerToast={triggerToast} />,
  };

  return (
    <>
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes drawerSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .settings-content-anim {
          animation: fadeSlideIn 0.3s ease forwards;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin-anim {
          animation: spin 0.8s linear infinite;
        }
      `}</style>

      <div style={{ display: "flex", width: "100%", alignItems: "start", height: "100%", overflow: "hidden" }}>
        {/* ─── LEFT NAV ─── */}
        <aside style={{
          width: "clamp(224px, 18vw, 260px)",
          height: "100%",
          background: "transparent",
          borderRight: "1px solid rgba(26,26,26,0.06)",
          padding: "24px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          boxSizing: "border-box",
          flexShrink: 0,
          overflowY: "auto",
        }}>
          <div style={{ padding: "0 10px", marginBottom: "20px", fontSize: "11px", fontWeight: 800, color: "#999999", textTransform: "uppercase", letterSpacing: "1px" }}>
            Настройки системы
          </div>

          {navItems.map((item: any) => {
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                style={{
                  display: "flex", alignItems: "center", gap: "12px",
                  width: "100%", padding: "12px 14px", borderRadius: "12px",
                  background: active ? "#FFFFFF" : "transparent",
                  border: active ? "1px solid rgba(26,26,26,0.04)" : "1px solid transparent",
                  color: active ? "#1A1A1A" : "#666666",
                  fontSize: "14px", fontWeight: active ? 800 : 600, cursor: "pointer",
                  transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  textAlign: "left",
                  boxShadow: active ? "0 4px 12px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02)" : "none",
                }}
                onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = "rgba(26,26,26,0.03)"; e.currentTarget.style.color = "#1A1A1A"; } }}
                onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#666666"; } }}
              >
                <div style={{ color: active ? "#F9A08B" : "#999999", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {item.icon}
                </div>
                <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.label}
                </span>
                {item.badge && (
                  <span style={{ background: active ? "#F9A08B" : "rgba(26,26,26,0.06)", color: active ? "#FFF" : "#1A1A1A", fontSize: "11px", fontWeight: 800, padding: "2px 8px", borderRadius: "20px" }}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          <div style={{ marginTop: "auto", paddingTop: "20px", borderTop: "1px solid rgba(26,26,26,0.06)", padding: "20px 0 0" }}>
            <button
              onClick={() => { setIsLoggedOut(true); triggerToast("Вы вышли из пространства Pilates Studio"); }}
              style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", padding: "12px 14px", borderRadius: "12px", background: "transparent", border: "1px solid transparent", color: "#D88C9A", fontSize: "14px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s ease", textAlign: "left" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(216,140,154,0.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>{icons.logout}</div>
              Сменить CRM
            </button>
          </div>
        </aside>

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

      <AddStaffModal
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
        <DeleteDataModal
          type={security.secModal}
          onClose={() => security.setSecModal(null)}
          onConfirm={() => {
            const msg = security.secModal === "deleteData"
              ? "База данных успешно очищена"
              : "Аккаунт компании удалён без возможности восстановления";
            security.setSecModal(null);
            triggerToast(msg);
          }}
        />
      )}

      {isLoggedOut && (
        <WorkspaceSelector
          studiosList={studiosList}
          setStudiosList={setStudiosList}
          onEnter={(name) => { setIsLoggedOut(false); triggerToast(`Вход выполнен: ${name}`); }}
          triggerToast={triggerToast}
        />
      )}

      <Toast message={toast} />
    </>
  );
}
