import { useState } from "react";
import { INITIAL_INTEGRATIONS_CONFIG } from "../constants";
import type { IntegrationsConfig } from "../types";

export function useIntegrations(
  triggerSave: (key: string, msg: string) => void,
  triggerToast: (msg: string) => void,
) {
  const [expandedIntegration, setExpandedIntegration] = useState<string | null>(null);
  const [integrationsConfig, setIntegrationsConfig] = useState<IntegrationsConfig>(INITIAL_INTEGRATIONS_CONFIG);

  const updateIntegrationField = (channel: string, field: string, value: any) => {
    setIntegrationsConfig(prev => ({
      ...prev,
      [channel]: { ...prev[channel], [field]: value }
    }));
  };

  const toggleIntegrationConnect = (channel: string, name: string) => {
    const isConnecting = !integrationsConfig[channel].connected;
    updateIntegrationField(channel, "connected", isConnecting);
    if (isConnecting) {
      triggerSave(`int_${channel}`, `Интеграция с ${name} успешно настроена и подключена`);
    } else {
      triggerToast(`Интеграция с ${name} отключена`);
    }
    setExpandedIntegration(null);
  };

  return {
    expandedIntegration, setExpandedIntegration,
    integrationsConfig,
    updateIntegrationField,
    toggleIntegrationConnect,
  };
}
