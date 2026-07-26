import { useState } from "react";
import { useTranslation } from "react-i18next";
import { INITIAL_SESSIONS, INITIAL_API_TOKENS } from "../constants";
import type { Session, ApiToken } from "../types";
import { useToast } from "../../../../components/ui/index";

export function useSecurity() {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [secExpanded, setSecExpanded] = useState<"sessions" | "token" | "export" | null>(null);
  const [secModal, setSecModal] = useState<"password" | "deleteData" | "deleteAccount" | null>(null);
  const [activeSessions, setActiveSessions] = useState<Session[]>(INITIAL_SESSIONS);
  const [apiTokens, setApiTokens] = useState<ApiToken[]>(INITIAL_API_TOKENS);
  const [newTokenName, setNewTokenName] = useState("");

  const terminateSession = (id: number) => {
    setActiveSessions(prev => prev.filter(s => s.id !== id));
    toast.success(t('security.sessions.terminatedToast'));
  };

  const revokeToken = (id: number) => {
    setApiTokens(prev => prev.filter(token => token.id !== id));
    toast.success(t('security.tokens.revokedToast'));
  };

  const generateToken = () => {
    if (!newTokenName) return;
    setApiTokens(prev => [...prev, {
      id: Date.now(),
      name: newTokenName,
      token_prefix: `vel_live_${Math.random().toString(36).substr(2, 8)}`,
      created_at: new Date().toISOString(),
      is_active: true,
    }]);
    setNewTokenName("");
    setSecExpanded(null);
    toast.success(t('security.tokens.generatedToast'));
  };

  return {
    secExpanded, setSecExpanded,
    secModal, setSecModal,
    activeSessions,
    apiTokens,
    newTokenName, setNewTokenName,
    terminateSession,
    revokeToken,
    generateToken,
  };
}
