import { useTranslation } from "react-i18next";
import { icons } from "../ui/SettingsIcons";
import SectionHeader from "../ui/SectionHeader";
import StatusBadge from "../ui/StatusBadge";
import Toggle from "../ui/form/Toggle";
import IntegrationIllustration from "../illustrations/IntegrationIllustration";
import type { IntegrationsConfig } from "../../types";
import { Button, Input, Select } from "../../../../../components/ui/index";

interface IntegrationsTabProps {
  expandedIntegration: string | null;
  setExpandedIntegration: (v: string | null) => void;
  integrationsConfig: IntegrationsConfig;
  updateIntegrationField: (channel: string, field: string, value: any) => void;
  toggleIntegrationConnect: (channel: string, name: string) => void;
}

const intIcons = {
  power: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>,
};

export default function IntegrationsTab({
  expandedIntegration, setExpandedIntegration,
  integrationsConfig, updateIntegrationField, toggleIntegrationConnect,
}: IntegrationsTabProps) {
  const { t } = useTranslation('settings');

  const INTEGRATION_LIST = [
    { id: "whatsapp", name: t('integrations.items.whatsapp.name'), sub: t('integrations.items.whatsapp.sub'), color: "#25D366" },
    { id: "telegram", name: t('integrations.items.telegram.name'), sub: t('integrations.items.telegram.sub'), color: "#229ED9" },
    { id: "instagram", name: t('integrations.items.instagram.name'), sub: t('integrations.items.instagram.sub'), color: "#E1306C" },
    { id: "google", name: t('integrations.items.google.name'), sub: t('integrations.items.google.sub'), color: "#4285F4" },
    { id: "onec", name: t('integrations.items.onec.name'), sub: t('integrations.items.onec.sub'), color: "#EF3B2C" },
    { id: "yandex", name: t('integrations.items.yandex.name'), sub: t('integrations.items.yandex.sub'), color: "#333333" },
  ];

  const syncOptions = (t('integrations.fields.googleSyncOptions', { returnObjects: true }) as string[]).map(v => ({ value: v, label: v }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.link} title={t('integrations.title')} subtitle={t('integrations.subtitle')} accent />
        <IntegrationIllustration />

        <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {INTEGRATION_LIST.map((item) => {
            const config = integrationsConfig[item.id];
            const isExpanded = expandedIntegration === item.id;
            const isConnected = config.connected;

            return (
              <div
                key={item.id}
                style={{
                  borderRadius: "14px",
                  background: isExpanded ? "#FFFFFF" : "rgba(0,0,0,0.015)",
                  border: `1px solid ${isExpanded ? "var(--peach)" : "rgba(0,0,0,0.04)"}`,
                  boxShadow: isExpanded ? "0 12px 32px rgba(252,174,145,0.1), 0 2px 6px rgba(252,174,145,0.05)" : "none",
                  transition: "all 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)",
                }}
              >
                <div
                  onClick={() => setExpandedIntegration(isExpanded ? null : item.id)}
                  style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px 20px", cursor: "pointer", background: isExpanded ? "rgba(252,174,145,0.02)" : "transparent" }}
                >
                  <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: `${item.color}14`, border: `1.5px solid ${item.color}25`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 900, color: item.color, flexShrink: 0 }}>
                    {item.name.slice(0, 2).toUpperCase()}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--onyx)" }}>{item.name}</div>
                    <div style={{ fontSize: "11.5px", color: "var(--muted)", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.sub}</div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "12px", pointerEvents: "none" }}>
                    <StatusBadge type={isConnected ? "active" : "warning"}>{isConnected ? t('integrations.status.connected') : t('integrations.status.notActive')}</StatusBadge>
                    <button style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 14px", borderRadius: "8px", background: isExpanded ? "var(--peach)" : "#FFFFFF", color: isExpanded ? "#FFFFFF" : "var(--onyx)", border: isExpanded ? "1px solid var(--peach)" : "1px solid rgba(26,26,26,0.1)", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", transition: "all 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)", boxShadow: isExpanded ? "0 4px 12px rgba(252,174,145,0.35)" : "0 2px 6px rgba(0,0,0,0.02)" }}>
                      {isConnected ? t('integrations.actions.configure') : t('integrations.actions.connect')}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s ease" }}>
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateRows: isExpanded ? "1fr" : "0fr", transition: "grid-template-rows 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)" }}>
                  <div style={{ minHeight: 0, overflow: "hidden" }}>
                    <div style={{ padding: "0 20px 20px 20px" }}>
                      <div style={{ width: "100%", height: "1px", background: "rgba(0,0,0,0.06)", marginBottom: "20px" }} />

                      {item.id === "whatsapp" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                          <Input label={t('integrations.fields.whatsappPhone')} value={config.phone} onChange={v => updateIntegrationField("whatsapp", "phone", v)} />
                          <Input label={t('integrations.fields.whatsappWebhook')} value={config.webhook} onChange={() => {}} disabled />
                        </div>
                      )}

                      {item.id === "telegram" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                          <Input label={t('integrations.fields.telegramToken')} placeholder={t('integrations.fields.telegramTokenPh')} value={config.token} onChange={v => updateIntegrationField("telegram", "token", v)} />
                          <Input label={t('integrations.fields.telegramWelcome')} value={config.welcomeMsg} onChange={v => updateIntegrationField("telegram", "welcomeMsg", v)} />
                        </div>
                      )}

                      {item.id === "instagram" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
                          <Input label={t('integrations.fields.instagramAccount')} placeholder={t('integrations.fields.instagramAccountPh')} value={config.account} onChange={v => updateIntegrationField("instagram", "account", v)} />
                        </div>
                      )}

                      {item.id === "google" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "flex-end" }}>
                          <Input label={t('integrations.fields.googleCalendarName')} value={config.calendarName} onChange={v => updateIntegrationField("google", "calendarName", v)} />
                          <Select value={config.syncType} options={syncOptions} onChange={v => updateIntegrationField("google", "syncType", v)} />
                        </div>
                      )}

                      {item.id === "onec" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                          <Input label={t('integrations.fields.onecUrl')} placeholder={t('integrations.fields.onecUrlPh')} value={config.url} onChange={v => updateIntegrationField("onec", "url", v)} />
                          <Input label={t('integrations.fields.onecLogin')} placeholder={t('integrations.fields.onecLoginPh')} value={config.login} onChange={v => updateIntegrationField("onec", "login", v)} />
                        </div>
                      )}

                      {item.id === "yandex" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "center" }}>
                          <Input label={t('integrations.fields.yandexShopId')} value={config.shopId} onChange={v => updateIntegrationField("yandex", "shopId", v)} />
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(0,0,0,0.015)", borderRadius: "10px", marginTop: "18px", border: "1px solid var(--border)" }}>
                            <div>
                              <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--onyx)" }}>{t('integrations.fields.yandexTestMode')}</div>
                              <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "1px" }}>{t('integrations.fields.yandexTestModeSub')}</div>
                            </div>
                            <Toggle checked={config.testMode} onChange={() => updateIntegrationField("yandex", "testMode", !config.testMode)} />
                          </div>
                        </div>
                      )}

                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
                        {isConnected && (
                          <button
                            onClick={() => toggleIntegrationConnect(item.id, item.name)}
                            style={{ display: "flex", alignItems: "center", gap: "5px", padding: "9px 18px", borderRadius: "10px", background: "rgba(216,140,154,0.08)", border: "1px solid rgba(216,140,154,0.2)", color: "#C0607A", fontSize: "12px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(216,140,154,0.15)"}
                            onMouseLeave={e => e.currentTarget.style.background = "rgba(216,140,154,0.08)"}
                          >
                            {intIcons.power}
                            {t('integrations.actions.disconnect')}
                          </button>
                        )}
                        <Button variant="primary" onClick={() => toggleIntegrationConnect(item.id, item.name)}>
                          {isConnected ? t('integrations.actions.saveChanges') : t('integrations.actions.activate')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
