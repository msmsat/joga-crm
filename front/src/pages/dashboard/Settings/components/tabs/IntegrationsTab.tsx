import { icons } from "../ui/SettingsIcons";
import SectionHeader from "../ui/SectionHeader";
import PremiumButton from "../ui/PremiumButton";
import StatusBadge from "../ui/StatusBadge";
import Toggle from "../ui/form/Toggle";
import InputRow from "../ui/form/InputRow";
import DarkSelectRow from "../ui/form/DarkSelectRow";
import IntegrationIllustration from "../illustrations/IntegrationIllustration";
import type { IntegrationsConfig } from "../../types";

interface IntegrationsTabProps {
  expandedIntegration: string | null;
  setExpandedIntegration: (v: string | null) => void;
  integrationsConfig: IntegrationsConfig;
  updateIntegrationField: (channel: string, field: string, value: any) => void;
  toggleIntegrationConnect: (channel: string, name: string) => void;
  savedStates: Record<string, boolean>;
}

const intIcons = {
  power: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>,
};

const INTEGRATION_LIST = [
  { id: "whatsapp", name: "WhatsApp Business", sub: "Рассылки сообщений и автоуведомления клиентам", color: "#25D366" },
  { id: "telegram", name: "Telegram Bot", sub: "Автоматическая круглосуточная запись через чат-бота", color: "#229ED9" },
  { id: "instagram", name: "Instagram Direct", sub: "Перехват входящих сообщений в CRM-систему", color: "#E1306C" },
  { id: "google", name: "Google Calendar", sub: "Двусторонняя синхронизация расписания тренеров", color: "#4285F4" },
  { id: "onec", name: "1С: Предприятие", sub: "Автоматическая выгрузка финансов и аналитики", color: "#EF3B2C" },
  { id: "yandex", name: "Яндекс.Касса (ЮKassa)", sub: "Безопасный приём онлайн-оплаты и предоплат на сайте", color: "#333333" },
];

export default function IntegrationsTab({
  expandedIntegration, setExpandedIntegration,
  integrationsConfig, updateIntegrationField, toggleIntegrationConnect,
  savedStates,
}: IntegrationsTabProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.link} title="Интеграции" subtitle="Подключите внешние каналы и экосистемы в один клик" accent />
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
                  overflow: "hidden",
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
                    <StatusBadge type={isConnected ? "active" : "warning"}>{isConnected ? "Подключено" : "Не активно"}</StatusBadge>
                    <button style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 14px", borderRadius: "8px", background: isExpanded ? "var(--peach)" : "#FFFFFF", color: isExpanded ? "#FFFFFF" : "var(--onyx)", border: isExpanded ? "1px solid var(--peach)" : "1px solid rgba(26,26,26,0.1)", fontSize: "11.5px", fontWeight: 700, cursor: "pointer", transition: "all 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)", boxShadow: isExpanded ? "0 4px 12px rgba(252,174,145,0.35)" : "0 2px 6px rgba(0,0,0,0.02)" }}>
                      {isConnected ? "Настроить" : "Подключить"}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s ease" }}>
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </button>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateRows: isExpanded ? "1fr" : "0fr", transition: "grid-template-rows 0.3s cubic-bezier(0.34, 1.5, 0.64, 1)" }}>
                  <div style={{ minHeight: 0 }}>
                    <div style={{ padding: "0 20px 20px 20px" }}>
                      <div style={{ width: "100%", height: "1px", background: "rgba(0,0,0,0.06)", marginBottom: "20px" }} />

                      {item.id === "whatsapp" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                          <InputRow label="Номер телефона WhatsApp Business" value={config.phone} onChange={v => updateIntegrationField("whatsapp", "phone", v)} />
                          <InputRow label="Адрес Webhook для синхронизации (Просмотр)" value={config.webhook} type="text" />
                        </div>
                      )}

                      {item.id === "telegram" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                          <InputRow label="API Токен Бота (из @BotFather)" placeholder="123456789:ABCDefGhIJKlmNo..." value={config.token} onChange={v => updateIntegrationField("telegram", "token", v)} />
                          <InputRow label="Приветственное сообщение в боте" value={config.welcomeMsg} onChange={v => updateIntegrationField("telegram", "welcomeMsg", v)} />
                        </div>
                      )}

                      {item.id === "instagram" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
                          <InputRow label="Имя привязанного бизнес-аккаунта Meta" placeholder="@your_studio_candles" value={config.account} onChange={v => updateIntegrationField("instagram", "account", v)} />
                        </div>
                      )}

                      {item.id === "google" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "flex-end" }}>
                          <InputRow label="Название календаря" value={config.calendarName} onChange={v => updateIntegrationField("google", "calendarName", v)} />
                          <DarkSelectRow label="Режим синхронизации" value={config.syncType} options={["Двусторонняя", "Только экспорт", "Только импорт"]} onChange={v => updateIntegrationField("google", "syncType", v)} />
                        </div>
                      )}

                      {item.id === "onec" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                          <InputRow label="URL шлюза публикации базы" placeholder="https://1c.company.ru/base" value={config.url} onChange={v => updateIntegrationField("onec", "url", v)} />
                          <InputRow label="Логин / Идентификатор CRM" placeholder="velora_sync_user" value={config.login} onChange={v => updateIntegrationField("onec", "login", v)} />
                        </div>
                      )}

                      {item.id === "yandex" && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", alignItems: "center" }}>
                          <InputRow label="Идентификатор магазина (ShopID)" value={config.shopId} onChange={v => updateIntegrationField("yandex", "shopId", v)} />
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(0,0,0,0.015)", borderRadius: "10px", marginTop: "18px", border: "1px solid var(--border)" }}>
                            <div>
                              <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--onyx)" }}>Тестовый режим оплаты</div>
                              <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "1px" }}>Проверка платежей без реального списания денег</div>
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
                            Отключить интеграцию
                          </button>
                        )}
                        <PremiumButton
                          isSaved={savedStates[`int_${item.id}`]}
                          onClick={() => toggleIntegrationConnect(item.id, item.name)}
                          text={isConnected ? "Сохранить изменения" : "Активировать шлюз"}
                          savedText="Настройки сохранены"
                        />
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
