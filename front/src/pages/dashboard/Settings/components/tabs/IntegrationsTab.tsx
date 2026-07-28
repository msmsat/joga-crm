import { useState } from "react";
import { useTranslation } from "react-i18next";
import { icons } from "../ui/SettingsIcons";
import SectionHeader from "../ui/SectionHeader";
import IntegrationIllustration from "../illustrations/IntegrationIllustration";
import IntegrationCard from "../integrations/IntegrationCard";
import DisconnectModal from "../modals/DisconnectModal";
import { EmptyState } from "../../../../../components/ui/index";
import { useIntegrations } from "../../hooks/useIntegrations";
import type { IntegrationType } from "../../../../../api/settings/settings.types";

const ORDER: { type: IntegrationType; color: string }[] = [
  { type: "telegram", color: "#229ED9" },
  { type: "whatsapp", color: "#25D366" },
  { type: "instagram", color: "#E1306C" },
  { type: "google_calendar", color: "#4285F4" },
];

export default function IntegrationsTab() {
  const { t } = useTranslation("settings");
  const {
    integrations, loading, loadError, studioTimezone,
    expandedIntegration, setExpandedIntegration,
    calendars, calendarsLoading,
    connectTelegram, connectWhatsApp, connectInstagram, startGoogleAuth,
    disconnect, updateGoogleCalendar, syncGoogleCalendar,
  } = useIntegrations();

  const [disconnectTarget, setDisconnectTarget] = useState<IntegrationType | null>(null);
  const disconnectData = integrations.find(i => i.type === disconnectTarget);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="card" style={{ padding: "28px" }}>
        <SectionHeader icon={icons.link} title={t("integrations.title")} subtitle={t("integrations.subtitle")} accent />
        <IntegrationIllustration />

        {loadError ? (
          <EmptyState size="sm" icon="search" title={t("integrations.loadError")} />
        ) : (
          <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {ORDER.map(({ type, color }) => {
              const data = integrations.find(i => i.type === type);
              if (!data) return null;
              return (
                <IntegrationCard
                  key={type}
                  type={type}
                  name={t(`integrations.items.${type}.name`)}
                  sub={t(`integrations.items.${type}.sub`)}
                  color={color}
                  data={data}
                  studioTimezone={studioTimezone}
                  isExpanded={expandedIntegration === type}
                  onToggleExpand={() => setExpandedIntegration(expandedIntegration === type ? null : type)}
                  onRequestDisconnect={() => setDisconnectTarget(type)}
                  connectTelegram={connectTelegram}
                  connectWhatsApp={connectWhatsApp}
                  connectInstagram={connectInstagram}
                  startGoogleAuth={startGoogleAuth}
                  calendars={calendars}
                  calendarsLoading={calendarsLoading}
                  updateGoogleCalendar={updateGoogleCalendar}
                  syncGoogleCalendar={syncGoogleCalendar}
                />
              );
            })}
            {!loading && integrations.length === 0 && (
              <EmptyState size="sm" icon="search" title={t("integrations.loadError")} />
            )}
          </div>
        )}
      </div>

      {disconnectTarget && disconnectData && (
        <DisconnectModal
          name={t(`integrations.items.${disconnectTarget}.name`)}
          capabilities={disconnectData.capabilities}
          loading={disconnect.isPending}
          onClose={() => setDisconnectTarget(null)}
          onConfirm={() => disconnect.mutate(disconnectTarget, { onSuccess: () => setDisconnectTarget(null) })}
        />
      )}
    </div>
  );
}
