// Единый движок чата Velora AI (эпик AI-1, задача 5) — общий для страницы AI,
// AI-дровера и AI-строки шапки. Стейт сервера живёт только в кэше TanStack
// Query (queryKeys.aiSessions / aiMessages) — несколько компонентов, вызвавших
// хук одновременно, читают один и тот же кэш, без ручной синхронизации между
// собой. Локальный React-стейт — только activeSessionId и isThinking.
import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { aiApi } from '../api/ai';
import type { AIChatMessage } from '../api/ai/ai.types';
import { queryKeys } from '../api/queryKeys';
import { useToast } from '../components/ui/Toast';
import { errorMessage } from '../api/errorMessage';
import { ApiError } from '../api/client';
import { useAIDrawer } from '../contexts/AIDrawerContext';

const MAX_MESSAGE_LENGTH = 4000;

// Бэкенд шлёт assistant_unavailable как голую строку detail (503, LLM_BASE_URL
// недоступен) — errorMessage() общий для всего приложения знает только про
// common:errors.*, здесь нужен свой ai:errors.* текст (эпик AI-4, задача 1).
function assistantErrorMessage(err: unknown, t: TFunction): string {
  if (err instanceof ApiError && err.message === 'assistant_unavailable') {
    return t('ai:errors.assistant_unavailable');
  }
  return errorMessage(err, t);
}

interface SendMessageVars {
  sessionId: number;
  text: string;
}

interface SendMessageCtx {
  sessionId: number;
  snapshot: AIChatMessage[];
}

export function useAssistant() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();

  // activeSessionId живёт в AIDrawerContext — общий для страницы AI, дровера и
  // AI-строки шапки (задача 7): один и тот же диалог виден на всех поверхностях.
  const { activeSessionId, setActiveSessionId } = useAIDrawer();
  const [isThinking, setIsThinking] = useState(false);
  // Защита от дубля при двойном Enter: закрывает и разрыв "создаём сессию" (до
  // старта мутации isPending ещё false), и сам полёт мутации.
  const sendingRef = useRef(false);

  const sessionsQuery = useQuery({
    queryKey: queryKeys.aiSessions,
    queryFn: () => aiApi.getSessions(),
    staleTime: 30_000,
  });

  const messagesQuery = useQuery({
    queryKey: queryKeys.aiMessages(activeSessionId ?? -1),
    queryFn: () => aiApi.getMessages(activeSessionId as number),
    enabled: activeSessionId != null,
    placeholderData: [],
  });

  const sendMut = useMutation({
    mutationFn: ({ sessionId, text }: SendMessageVars) => aiApi.sendMessage(sessionId, text),
    onMutate: async ({ sessionId, text }): Promise<SendMessageCtx> => {
      await qc.cancelQueries({ queryKey: queryKeys.aiMessages(sessionId) });
      const snapshot = qc.getQueryData<AIChatMessage[]>(queryKeys.aiMessages(sessionId)) ?? [];
      const optimisticUser: AIChatMessage = {
        id: -Date.now(),
        session_id: sessionId,
        role: 'user',
        text,
        created_at: new Date().toISOString(),
      };
      qc.setQueryData(queryKeys.aiMessages(sessionId), [...snapshot, optimisticUser]);
      setIsThinking(true);
      return { sessionId, snapshot };
    },
    onSuccess: ({ user, assistant }, { sessionId }) => {
      qc.setQueryData<AIChatMessage[]>(queryKeys.aiMessages(sessionId), (prev) => [
        ...(prev ?? []).filter((m) => m.id >= 0),
        user,
        assistant,
      ]);
    },
    onError: (err, _vars, ctx) => {
      if (ctx) qc.setQueryData(queryKeys.aiMessages(ctx.sessionId), ctx.snapshot);
      toast.error(assistantErrorMessage(err, t));
    },
    onSettled: () => {
      setIsThinking(false);
      qc.invalidateQueries({ queryKey: queryKeys.aiSessions });
    },
  });

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH || sendingRef.current) return;

    sendingRef.current = true;
    try {
      let sessionId = activeSessionId;
      if (sessionId == null) {
        const session = await aiApi.createSession();
        sessionId = session.id;
        setActiveSessionId(sessionId);
      }
      await sendMut.mutateAsync({ sessionId, text: trimmed });
    } finally {
      sendingRef.current = false;
    }
  }, [activeSessionId, sendMut, setActiveSessionId]);

  const newChat = useCallback(() => setActiveSessionId(null), [setActiveSessionId]);
  const loadSession = useCallback((sessionId: number) => setActiveSessionId(sessionId), [setActiveSessionId]);

  const deleteMut = useMutation({
    mutationFn: (sessionId: number) => aiApi.deleteSession(sessionId),
    onSuccess: (_data, sessionId) => {
      qc.invalidateQueries({ queryKey: queryKeys.aiSessions });
      setActiveSessionId((current) => (current === sessionId ? null : current));
    },
    onError: (err) => toast.error(errorMessage(err, t)),
  });
  const deleteSession = useCallback((sessionId: number) => deleteMut.mutateAsync(sessionId), [deleteMut]);

  return {
    sessions: sessionsQuery.data ?? [],
    sessionsLoading: sessionsQuery.isLoading,
    sessionsError: sessionsQuery.isError,
    refetchSessions: sessionsQuery.refetch,
    messages: messagesQuery.data ?? [],
    messagesLoading: messagesQuery.isLoading,
    messagesError: messagesQuery.isError,
    refetchMessages: messagesQuery.refetch,
    isThinking,
    activeSessionId,
    sendMessage,
    newChat,
    loadSession,
    deleteSession,
  };
}
