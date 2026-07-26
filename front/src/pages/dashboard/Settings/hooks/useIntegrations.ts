import { useState } from "react";
import { useTranslation } from "react-i18next";
import { INITIAL_INTEGRATIONS_CONFIG } from "../constants";
import type { IntegrationsConfig } from "../types";
import { useToast } from "../../../../components/ui/index";

export function useIntegrations() {
  const { t } = useTranslation('settings');
  const toast = useToast();
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
      toast.success(t('integrations.toast.connected', { name }));
    } else {
      toast.success(t('integrations.toast.disconnected', { name }));
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
