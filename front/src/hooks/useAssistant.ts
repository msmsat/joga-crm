// Единый движок чата Velora AI (эпик AI-1, задача 5) — общий для страницы AI,
// AI-дровера и AI-строки шапки. Стейт сервера живёт только в кэше TanStack
// Query (queryKeys.aiSessions / aiMessages) — несколько компонентов, вызвавших
// хук одновременно, читают один и тот же кэш, без ручной синхронизации между
// собой. Локальный React-стейт — только activeSessionId и isThinking.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { aiApi } from '../api/ai';
import type { AIActionProposal, AIChatMessage } from '../api/ai/ai.types';
import { queryKeys } from '../api/queryKeys';
import { useToast } from '../components/ui/Toast';
import { errorMessage } from '../api/errorMessage';
import { ApiError } from '../api/client';

const MAX_MESSAGE_LENGTH = 4000;

// Бэкенд шлёт assistant_unavailable как голую строку detail (503, провайдер
// недоступен) — errorMessage() общий для всего приложения знает только про
// common:errors.*, здесь нужен свой ai:errors.* текст (эпик AI-4, задача 1).
// Исчерпанная квота (429) приходит кодом в detail-объекте (эпик AI-5, задача 3):
// ai_quota_exceeded и ai_cost_cap показываем одним текстом — владельцу всё равно,
// каким именно концом кончился запас.
function assistantErrorMessage(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
    if (err.message === 'assistant_unavailable') return t('ai:errors.assistant_unavailable');
    if (err.code === 'ai_quota_exceeded' || err.code === 'ai_cost_cap') {
      return t('ai:errors.quota_exceeded');
    }
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

// Черновик ответа, который дописывается на каждом событии token. Живёт только
// до события done — на нём черновику проставляется настоящий id из БД, прямо
// в кэше, тем же объектом.
const DRAFT_ID = -1;
// Ключ ленты, пока сессия ещё не создана: messagesQuery читает aiMessages(-1),
// когда activeSessionId == null. Сюда кладём пузырь пользователя, чтобы он
// появился по клику, а не после рейса за созданием сессии.
const NO_SESSION_KEY = -1;

export function useAssistant() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Теперь у каждого компонента, вызывающего useAssistant, будет своя независимая сессия
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  // Имя инструмента, который ассистент дёргает прямо сейчас («get_schedule») —
  // под строкой ввода из него делается «Смотрю расписание…».
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [proposal, setProposal] = useState<AIActionProposal | null>(null);
  // Защита от дубля при двойном Enter: закрывает и разрыв "создаём сессию" (до
  // старта мутации isPending ещё false), и сам полёт мутации.
  const sendingRef = useRef(false);
  // Поток отменяется при размонтировании и при смене сессии, иначе токены
  // закрытого чата дописываются в открытый. React 19 StrictMode вызывает
  // эффекты дважды: без отмены получится два потока и двойной счёт.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

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
    // Свежий локальный кэш не перезапрашиваем: иначе GET, стартовавший на
    // переключении ключа, дочитывался посреди стрима и на секунду затирал
    // черновик ответом «сообщений ещё нет».
    staleTime: 30_000,
  });

  const sendMut = useMutation({
    mutationFn: ({ sessionId, text }: SendMessageVars) => aiApi.sendMessage(sessionId, text, pathname),
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
    onSuccess: ({ user, assistant, action_proposal }, { sessionId }) => {
      qc.setQueryData<AIChatMessage[]>(queryKeys.aiMessages(sessionId), (prev) => [
        ...(prev ?? []).filter((m) => m.id >= 0),
        user,
        assistant,
      ]);
      setProposal(action_proposal);
    },
    onError: (_err, _vars, ctx) => {
      // Тост показывает sendMessage — он один на оба пути (стрим и фолбэк),
      // иначе на упавшем фолбэке пользователь получал бы две одинаковые ошибки.
      if (ctx) qc.setQueryData(queryKeys.aiMessages(ctx.sessionId), ctx.snapshot);
    },
    onSettled: () => {
      setIsThinking(false);
      qc.invalidateQueries({ queryKey: queryKeys.aiSessions });
    },
  });

  // Стрим. Черновик ответа кладём прямо в кэш TanStack Query — тот же приём,
  // что у мутации выше, поэтому все три поверхности ИИ показывают его
  // одновременно. Пузырь пользователя уже лежит там (его кладёт sendMessage).
  const streamMessage = useCallback(async (sessionId: number, text: string, userMsgId: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const key = queryKeys.aiMessages(sessionId);
    await qc.cancelQueries({ queryKey: key });
    // Прошлый черновик выкидываем: после упавшего стрима он остаётся в ленте
    // пустым, а два DRAFT_ID подряд получили бы один и тот же текст.
    qc.setQueryData<AIChatMessage[]>(key, (prev) => [
      ...(prev ?? []).filter((m) => m.id !== DRAFT_ID),
      { id: DRAFT_ID, session_id: sessionId, role: 'assistant', text: '', created_at: new Date().toISOString() },
    ]);
    setToolStatus(null);
    setProposal(null);

    let draft = '';
    // done принёс настоящие id — перечитывать историю не нужно.
    let saved = false;
    try {
      await aiApi.streamMessage(sessionId, text, (event, data) => {
        if (event === 'token') {
          draft += String(data);
          setToolStatus(null);
          qc.setQueryData<AIChatMessage[]>(key, (prev) =>
            (prev ?? []).map((m) => (m.id === DRAFT_ID ? { ...m, text: draft } : m)),
          );
        } else if (event === 'tool_status') {
          setToolStatus(String(data));
        } else if (event === 'action_proposal') {
          setProposal(data as AIActionProposal);
        } else if (event === 'navigate') {
          // Переход только по явной просьбе пользователя: сервер шлёт это
          // событие ровно тогда, когда модель вызвала инструмент navigate.
          navigate(String(data));
        } else if (event === 'quota') {
          qc.setQueryData(queryKeys.aiQuota, data);
        } else if (event === 'done') {
          // Настоящие id из БД проставляем ТЕМ ЖЕ объектам в кэше. Раньше здесь
          // был рефетч всей ленты: у пузырей менялся key, React размонтировал
          // их и заново проигрывал появление — ровно в тот момент, когда ответ
          // начинали читать. Это и выглядело как перезагрузка страницы.
          const { user_id, assistant_id } = data as { user_id: number; assistant_id: number };
          saved = true;
          qc.setQueryData<AIChatMessage[]>(key, (prev) =>
            (prev ?? []).map((m) =>
              m.id === userMsgId ? { ...m, id: user_id }
                : m.id === DRAFT_ID ? { ...m, id: assistant_id } : m),
          );
        } else if (event === 'error') {
          const code = (data as { code?: string }).code ?? 'assistant_unavailable';
          const quota = code === 'ai_quota_exceeded' || code === 'ai_cost_cap';
          throw new ApiError(quota ? 429 : 503, code, code);
        }
      }, { currentPage: pathname, signal: controller.signal });
    } finally {
      abortRef.current = null;
      setIsThinking(false);
      setToolStatus(null);
    }

    // done не дошёл (прокси обрезал хвост) — только тогда перечитываем историю:
    // черновик с id -1 иначе столкнулся бы со следующим ответом.
    if (!saved) await qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: queryKeys.aiSessions });   // изменился preview
  }, [navigate, pathname, qc]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH || sendingRef.current) return;

    sendingRef.current = true;
    // Пузырь пользователя и «думаю» — в тот же кадр, что и клик. Создание сессии
    // это ещё один рейс к серверу, и первое сообщение раньше висело в пустоте
    // всё это время.
    const pendingId = -Date.now();
    const seed = (sid: number) =>
      qc.setQueryData<AIChatMessage[]>(queryKeys.aiMessages(sid), (prev) => [
        ...(prev ?? []).filter((m) => m.id !== pendingId),
        { id: pendingId, session_id: sid, role: 'user' as const, text: trimmed, created_at: new Date().toISOString() },
      ]);
    setIsThinking(true);
    try {
      let sessionId = activeSessionId;
      if (sessionId == null) {
        seed(NO_SESSION_KEY);
        const session = await aiApi.createSession();
        sessionId = session.id;
        seed(sessionId);                // сначала данные в новый ключ...
        setActiveSessionId(sessionId);  // ...потом переключение: иначе кадр с пустым чатом
      } else {
        seed(sessionId);
      }
      try {
        await streamMessage(sessionId, trimmed, pendingId);
      } catch (err) {
        // Пользователь ушёл со страницы или сменил чат — это не ошибка.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Квота и недоступный провайдер — настоящие ошибки, повторять их
        // обычным запросом бессмысленно: он упрётся в то же самое.
        if (err instanceof ApiError && err.status === 429) throw err;
        if (err instanceof ApiError && err.message === 'assistant_unavailable') throw err;
        // Всё остальное (прокси съел стрим, сеть не дала ReadableStream) —
        // тихо уходим на обычный /messages: стрим это улучшение, не единственный
        // путь. Свои оптимистичные записи убираем целиком (у них id < 0): иначе
        // sendMut добавит второе такое же user-сообщение.
        qc.setQueryData<AIChatMessage[]>(
          queryKeys.aiMessages(sessionId),
          (prev) => (prev ?? []).filter((m) => m.id >= 0),
        );
        await sendMut.mutateAsync({ sessionId, text: trimmed });
      }
    } catch (err) {
      toast.error(assistantErrorMessage(err, t));
    } finally {
      sendingRef.current = false;
      setIsThinking(false);   // на случай, если упало создание сессии — до стрима
    }
  }, [activeSessionId, qc, sendMut, streamMessage, t, toast]);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    setProposal(null);
    // Чистим ленту «сессии нет»: иначе новый чат открылся бы с пузырём прошлого
    // сообщения — он остаётся в кэше под ключом -1.
    qc.setQueryData(queryKeys.aiMessages(NO_SESSION_KEY), []);
    setActiveSessionId(null);
  }, [qc]);

  const loadSession = useCallback((sessionId: number) => {
    abortRef.current?.abort();
    setProposal(null);
    setActiveSessionId(sessionId);
  }, [setActiveSessionId]);

  // Что перечитать после исполненного действия. Ключи ТОЧНЫЕ: queryKeys.schedule
  // в проекте не существует, а queryKeys.clients — функция (search, category),
  // не готовый ключ, поэтому инвалидируем префиксы.
  const invalidateAfterAction = useCallback((tool: string, args: Record<string, unknown>) => {
    if (tool === 'book_client' || tool === 'cancel_booking' || tool === 'create_lesson') {
      qc.invalidateQueries({ queryKey: queryKeys.journalLessonsAll });
    } else if (tool === 'create_client') {
      qc.invalidateQueries({ queryKey: queryKeys.clientsAll });
    } else if (tool === 'freeze_subscription') {
      const id = Number(args.client_id);
      if (Number.isFinite(id)) {
        qc.invalidateQueries({ queryKey: queryKeys.client(id) });
        qc.invalidateQueries({ queryKey: queryKeys.clientEventsAll(id) });
      }
    }
  }, [qc]);

  const executeMut = useMutation({
    mutationFn: (token: string) => aiApi.executeAction(token),
    onSuccess: ({ message }) => {
      qc.setQueryData<AIChatMessage[]>(
        queryKeys.aiMessages(message.session_id),
        (prev) => [...(prev ?? []).filter((m) => m.id >= 0), message],
      );
      if (proposal) invalidateAfterAction(proposal.tool, proposal.args);
      setProposal(null);
      toast.success(message.text);
    },
    onError: (err) => toast.error(assistantErrorMessage(err, t)),
  });

  const confirmAction = useCallback(() => {
    if (proposal) executeMut.mutate(proposal.token);
  }, [executeMut, proposal]);

  // Отказ: карточка исчезает, токен протухает сам через 10 минут.
  const cancelAction = useCallback(() => setProposal(null), []);

  const deleteMut = useMutation({
    mutationFn: (sessionId: number) => aiApi.deleteSession(sessionId),
    onSuccess: (_data, sessionId) => {
      qc.invalidateQueries({ queryKey: queryKeys.aiSessions });
      qc.setQueryData(queryKeys.aiMessages(NO_SESSION_KEY), []);   // см. newChat
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
    toolStatus,
    actionProposal: proposal,
    confirmAction,
    cancelAction,
    actionPending: executeMut.isPending,
    activeSessionId,
    sendMessage,
    newChat,
    loadSession,
    deleteSession,
  };
}
