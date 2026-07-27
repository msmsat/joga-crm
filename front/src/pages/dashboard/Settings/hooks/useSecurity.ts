import { useState } from "react";
import { useTranslation } from "react-i18next";
import { INITIAL_SESSIONS } from "../constants";
import type { Session } from "../types";
import { useToast } from "../../../../components/ui/index";

export function useSecurity() {
  const { t } = useTranslation('settings');
  const toast = useToast();
  const [secExpanded, setSecExpanded] = useState<"sessions" | "export" | null>(null);
  const [secModal, setSecModal] = useState<"password" | "deleteData" | "deleteAccount" | null>(null);
  const [activeSessions, setActiveSessions] = useState<Session[]>(INITIAL_SESSIONS);

  const terminateSession = (id: number) => {
    setActiveSessions(prev => prev.filter(s => s.id !== id));
    toast.success(t('security.sessions.terminatedToast'));
  };

  return {
    secExpanded, setSecExpanded,
    secModal, setSecModal,
    activeSessions,
    terminateSession,
  };
}
