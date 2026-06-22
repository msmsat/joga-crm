import { useState } from "react";
import { INITIAL_SESSIONS, INITIAL_API_TOKENS } from "../constants";
import type { Session, ApiToken } from "../types";

export function useSecurity(triggerToast: (msg: string) => void) {
  const [secExpanded, setSecExpanded] = useState<"sessions" | "token" | "export" | null>(null);
  const [secModal, setSecModal] = useState<"password" | "deleteData" | "deleteAccount" | null>(null);
  const [activeSessions, setActiveSessions] = useState<Session[]>(INITIAL_SESSIONS);
  const [apiTokens, setApiTokens] = useState<ApiToken[]>(INITIAL_API_TOKENS);
  const [newTokenName, setNewTokenName] = useState("");

  const terminateSession = (id: number) => {
    setActiveSessions(prev => prev.filter(s => s.id !== id));
    triggerToast("Сессия успешно завершена");
  };

  const revokeToken = (id: number) => {
    setApiTokens(prev => prev.filter(t => t.id !== id));
    triggerToast("API токен отозван и удален");
  };

  const generateToken = () => {
    if (!newTokenName) return;
    setApiTokens(prev => [...prev, {
      id: Date.now(),
      name: newTokenName,
      key: `vel_live_${Math.random().toString(36).substr(2, 8)}`,
      created: "Только что",
    }]);
    setNewTokenName("");
    setSecExpanded(null);
    triggerToast("Новый API ключ сгенерирован");
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
