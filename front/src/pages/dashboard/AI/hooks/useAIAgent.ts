import { useState, useCallback } from 'react';
import type { AgentConfig, AISettings, AgentTone } from '../types';
import { DEFAULT_AGENT_CONFIG, DEFAULT_AI_SETTINGS } from '../constants';

export function useAIAgent() {
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(DEFAULT_AGENT_CONFIG);
  const [aiSettings, setAISettings] = useState<AISettings>(DEFAULT_AI_SETTINGS);
  const [saved, setSaved] = useState(false);

  const toggleChannel = useCallback((channel: 'telegram' | 'instagram') => {
    setAgentConfig(prev => ({
      ...prev,
      [channel]: { ...prev[channel], enabled: !prev[channel].enabled },
    }));
  }, []);

  const updateChannel = useCallback(
    (channel: 'telegram' | 'instagram', field: string, value: string | number | boolean | AgentTone) => {
      setAgentConfig(prev => ({
        ...prev,
        [channel]: { ...prev[channel], [field]: value },
      }));
    },
    []
  );

  const updateSystemPrompt = useCallback((prompt: string) => {
    setAgentConfig(prev => ({ ...prev, systemPrompt: prompt }));
  }, []);

  const updateAISettings = useCallback((patch: Partial<AISettings>) => {
    setAISettings(prev => ({ ...prev, ...patch }));
  }, []);

  const saveConfig = useCallback(() => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }, []);

  return { agentConfig, aiSettings, saved, toggleChannel, updateChannel, updateSystemPrompt, updateAISettings, saveConfig };
}
