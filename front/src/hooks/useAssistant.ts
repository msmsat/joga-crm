// Единый движок чата Velora AI (эпик AI-1, задача 5) — общий для страницы AI,
// AI-дровера и AI-строки шапки. Стейт сервера живёт только в кэше TanStack
// Query (queryKeys.aiSessions / aiMessages) — несколько компонентов, вызвавших
// хук одновременно, читают один и тот же кэш, без ручной синхронизации между
// собой. Локальный React-стейт — только activeSessionId и isThinking.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { aiApi } from '../api/ai';
import type { AIChatMessage, AIPlanProposal } from '../api/ai/ai.types';
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
    // Пробный потолок — отдельным текстом: тариф его не поднимает, и совет
    // «улучшите тариф» из quota_exceeded здесь стоил бы владельцу денег зря.
    if (err.code === 'ai_trial_exhausted') return t('ai:errors.trial_exhausted');
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
// Ключ ленты, пока сессия ещё не создана: messagesQuery читает его, когда
// activeSessionId == null. Сюда кладём пузырь пользователя, чтобы он появился
// по клику, а не после рейса за созданием сессии. У поверхностей он разный:
// иначе пустая панель на секунду показывала бы вопрос, заданный со страницы.
const NO_SESSION_KEY: Record<AISurface, number> = { drawer: -1, page: -2 };

// Что ассистент попросил открыть (событие ui_action, инструмент open_ui).
interface UiAction {
  page: string;
  tab?: string | null;
  intent?: string | null;
  entity_id?: number | null;
}

// Адрес вместо шины событий: страница подписывается на ?ai= хуком useAiIntent.
function uiActionPath({ page, tab, intent, entity_id }: UiAction): string {
  const params = new URLSearchParams();
  if (tab) params.set('tab', tab);
  if (intent) params.set('ai', intent);
  if (entity_id != null) params.set('ai_id', String(entity_id));
  const query = params.toString();
  return query ? `${page}?${query}` : page;
}

// Поверхность чата. Страница AI и панель ведут диалоги независимо: на странице
// разбирают выручку, в панели спрашивают про клиента — и каждая при следующем
// открытии показывает СВОЙ последний чат. Шапка делит поверхность с панелью:
// «продолжить в чате» там открывает именно её.
export type AISurface = 'page' | 'drawer';

// Последний открытый чат переживает перезагрузку страницы — по одному id на
// поверхность.
const storageKey = (surface: AISurface) => `ai_active_session:${surface}`;
export const AI_SURFACES: readonly AISurface[] = ['page', 'drawer'];

function storedSessionId(surface: AISurface): number | null {
  const id = Number(localStorage.getItem(storageKey(surface)));
  return Number.isFinite(id) && id > 0 ? id : null;
}

// Единственная точка записи активной сессии: кэш и localStorage всегда меняются
// вместе. Вне хука её дёргает удаление чата — оно гасит открытый диалог на
// ОБЕИХ поверхностях, не только на той, откуда нажали.
function writeActiveSession(qc: QueryClient, surface: AISurface, id: number | null): void {
  qc.setQueryData(queryKeys.aiActiveSession(surface), id);
  if (id == null) localStorage.removeItem(storageKey(surface));
  else localStorage.setItem(storageKey(surface), String(id));
}

// Восстановленный id сверяем со списком сессий ровно один раз за загрузку
// страницы: чат могли удалить с другого устройства, а после смены студии он и
// вовсе чужой. Сессию, созданную в этой вкладке, проверять нельзя — список с
// ней приходит только после стрима, и проверка выкинула бы человека из чата,
// в который он прямо сейчас пишет.
const sessionToVerify: Record<AISurface, number | null> = {
  page: storedSessionId('page'),
  drawer: storedSessionId('drawer'),
};

// Ширина окна тремя ступенями вёрстки — ассистент отвечает про ту раскладку,
// которую человек видит сейчас: на телефоне нет ни бокового меню, ни заголовков
// панелей, и «посмотри в левой колонке» там просто ложь. Пороги — брейкпоинты
// App.css. Ресайз-хук не нужен: значение читается в момент отправки.
function viewport(): 'phone' | 'tablet' | 'desktop' {
  const width = window.innerWidth;
  return width < 768 ? 'phone' : width < 1024 ? 'tablet' : 'desktop';
}

export function useAssistant(surface: AISurface = 'drawer') {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  // Адрес целиком, вместе с ?tab= и ?client=: «как это настроить?» на вкладке
  // «Абонементы» и на вкладке «Услуги» — разные вопросы.
  const currentPage = pathname + search;

  const noSessionKey = NO_SESSION_KEY[surface];
  const activeKey = useMemo(() => queryKeys.aiActiveSession(surface), [surface]);

  // Открытый диалог живёт в кэше Query, а не в useState: у поверхности бывает
  // несколько вызовов хука (шапка и панель — оба 'drawer'), и локальный стейт
  // давал каждому свой id — «продолжить в чате» открывало панель с
  // activeSessionId === null. Лента там читалась по ключу «сессии нет», где
  // лежит затравочный пузырь первого вопроса, — человек видел одно своё
  // сообщение и лез за собственным диалогом в историю (эпик AI-1, задача 7).
  const { data: activeSessionId = null } = useQuery<number | null>({
    queryKey: activeKey,
    queryFn: () => null,
    initialData: () => storedSessionId(surface),
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const setActiveSessionId = useCallback(
    (id: number | null) => writeActiveSession(qc, surface, id),
    [qc, surface],
  );
  const [isThinking, setIsThinking] = useState(false);
  // Имя инструмента, который ассистент дёргает прямо сейчас («get_schedule») —
  // под строкой ввода из него делается «Смотрю расписание…».
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [proposal, setProposal] = useState<AIPlanProposal | null>(null);
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

  useEffect(() => {
    const sessions = sessionsQuery.data;
    const restored = sessionToVerify[surface];
    if (restored == null || !sessions) return;
    const gone = !sessions.some((s) => s.id === restored);
    if (gone && qc.getQueryData<number | null>(activeKey) === restored) setActiveSessionId(null);
    sessionToVerify[surface] = null;
  }, [sessionsQuery.data, qc, setActiveSessionId, surface, activeKey]);

  const messagesQuery = useQuery({
    queryKey: queryKeys.aiMessages(activeSessionId ?? noSessionKey),
    queryFn: () => aiApi.getMessages(activeSessionId as number),
    enabled: activeSessionId != null,
    placeholderData: [],
    // Свежий локальный кэш не перезапрашиваем: иначе GET, стартовавший на
    // переключении ключа, дочитывался посреди стрима и на секунду затирал
    // черновик ответом «сообщений ещё нет».
    staleTime: 30_000,
  });

  const sendMut = useMutation({
    mutationFn: ({ sessionId, text }: SendMessageVars) => aiApi.sendMessage(sessionId, text, currentPage, viewport()),
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
    onSuccess: ({ user, assistant, plan_proposal }, { sessionId }) => {
      qc.setQueryData<AIChatMessage[]>(queryKeys.aiMessages(sessionId), (prev) => [
        ...(prev ?? []).filter((m) => m.id >= 0),
        user,
        assistant,
      ]);
      setProposal(plan_proposal);
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
        } else if (event === 'plan_proposal') {
          setProposal(data as AIPlanProposal);
        } else if (event === 'ui_action') {
          // Открываем экран только по явной просьбе пользователя: сервер шлёт
          // это событие ровно тогда, когда модель вызвала open_ui. Адрес с
          // параметрами, а не глобальная шина: его можно переслать, открыть в
          // новой вкладке и пережить им F5 (эпик AI-6, решение 6).
          navigate(uiActionPath(data as UiAction));
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
          const quota = code === 'ai_quota_exceeded' || code === 'ai_cost_cap'
            || code === 'ai_trial_exhausted';
          throw new ApiError(quota ? 429 : 503, code, code);
        }
      }, { currentPage, viewport: viewport(), signal: controller.signal });
    } finally {
      abortRef.current = null;
      setIsThinking(false);
      setToolStatus(null);
    }

    // done не дошёл (прокси обрезал хвост) — только тогда перечитываем историю:
    // черновик с id -1 иначе столкнулся бы со следующим ответом.
    if (!saved) await qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: queryKeys.aiSessions });   // изменился preview
  }, [navigate, currentPage, qc]);

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
        seed(noSessionKey);
        const session = await aiApi.createSession();
        sessionId = session.id;
        seed(sessionId);                // сначала данные в новый ключ...
        setActiveSessionId(sessionId);  // ...потом переключение: иначе кадр с пустым чатом
        // Затравку под ключом «сессии нет» убираем сразу: сессия у неё уже есть,
        // а оставшийся пузырь всплывал бы в следующем «новом чате».
        qc.setQueryData(queryKeys.aiMessages(noSessionKey), []);
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
  }, [activeSessionId, setActiveSessionId, noSessionKey, qc, sendMut, streamMessage, t, toast]);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    setProposal(null);
    // Чистим ленту «сессии нет»: иначе новый чат открылся бы с пузырём прошлого
    // сообщения — он остаётся в кэше под этим ключом.
    qc.setQueryData(queryKeys.aiMessages(noSessionKey), []);
    setActiveSessionId(null);
  }, [qc, noSessionKey, setActiveSessionId]);

  const loadSession = useCallback((sessionId: number) => {
    abortRef.current?.abort();
    setProposal(null);
    setActiveSessionId(sessionId);
  }, [setActiveSessionId]);

  // Что перечитать после исполненного действия. Ключи ТОЧНЫЕ: queryKeys.schedule
  // в проекте не существует, а queryKeys.clients — функция (search, category),
  // не готовый ключ, поэтому инвалидируем префиксы.
  const invalidateAfterAction = useCallback((tool: string, args: Record<string, unknown>) => {
    if (tool === 'book_client' || tool === 'cancel_booking' || tool === 'create_lesson'
        || tool === 'fill_schedule') {
      qc.invalidateQueries({ queryKey: queryKeys.journalLessonsAll });
    } else if (tool === 'create_staff' || tool === 'update_staff'
               || tool === 'set_staff_schedule' || tool === 'delete_staff') {
      qc.invalidateQueries({ queryKey: queryKeys.staff });
      // Расписание сотрудника — колонки Журнала: заведённый тренер обязан
      // появиться в сетке сразу, иначе занятия ему поставить некуда.
      qc.invalidateQueries({ queryKey: queryKeys.journalLessonsAll });
    } else if (tool === 'create_client') {
      qc.invalidateQueries({ queryKey: queryKeys.clientsAll });
    } else if (tool === 'freeze_client') {
      const id = Number(args.client_id);
      if (Number.isFinite(id)) {
        qc.invalidateQueries({ queryKey: queryKeys.client(id) });
        qc.invalidateQueries({ queryKey: queryKeys.clientEventsAll(id) });
      }
    }
  }, [qc]);

  const executeMut = useMutation({
    mutationFn: (answers: Record<string, Record<string, unknown>>) =>
      aiApi.executePlan(proposal?.token ?? '', answers),
    onSuccess: ({ message }) => {
      qc.setQueryData<AIChatMessage[]>(
        queryKeys.aiMessages(message.session_id),
        (prev) => [...(prev ?? []).filter((m) => m.id >= 0), message],
      );
      // Гасим кэш по КАЖДОМУ шагу: пачка «завести четверых и поставить им
      // занятия» трогает и команду, и журнал, а сбросить только по первому
      // шагу значит оставить половину экранов со старыми данными.
      for (const step of proposal?.steps ?? []) invalidateAfterAction(step.tool, step.args);
      setProposal(null);
      toast.success(message.text);
    },
    onError: (err) => toast.error(assistantErrorMessage(err, t)),
  });

  const confirmAction = useCallback((answers: Record<string, Record<string, unknown>> = {}) => {
    if (proposal) executeMut.mutate(answers);
  }, [executeMut, proposal]);

  // Вернуть то, что наделало исполненное действие. Точечно гасить кэш здесь
  // нечем: чем откатывать, помнит сервер, и списка инструментов у фронта нет.
  // Гасим всё — откат человек делает редко и осознанно, а недогашенный экран
  // показал бы занятие, которого уже нет.
  const undoMut = useMutation({
    mutationFn: (messageId: number) => aiApi.undoAction(messageId),
    onSuccess: (message) => {
      qc.setQueryData<AIChatMessage[]>(
        queryKeys.aiMessages(message.session_id),
        (prev) => (prev ?? []).map((m) => (m.id === message.id ? message : m)),
      );
      qc.invalidateQueries();
      toast.success(message.text);
    },
    onError: (err) => toast.error(assistantErrorMessage(err, t)),
  });

  const undoAction = useCallback(
    (messageId: number) => undoMut.mutateAsync(messageId),
    [undoMut],
  );

  // Отказ: окно исчезает, токен протухает сам через полчаса.
  const cancelAction = useCallback(() => setProposal(null), []);

  const deleteMut = useMutation({
    mutationFn: (sessionId: number) => aiApi.deleteSession(sessionId),
    onSuccess: (_data, sessionId) => {
      qc.invalidateQueries({ queryKey: queryKeys.aiSessions });
      qc.setQueryData(queryKeys.aiMessages(noSessionKey), []);   // см. newChat
      // Удалённый чат мог быть открыт и на другой поверхности — гасим обе,
      // иначе панель осталась бы с историей несуществующей сессии.
      for (const s of AI_SURFACES) {
        if (qc.getQueryData(queryKeys.aiActiveSession(s)) === sessionId) writeActiveSession(qc, s, null);
      }
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
    planProposal: proposal,
    confirmAction,
    cancelAction,
    undoAction,
    undoPending: undoMut.isPending,
    actionPending: executeMut.isPending,
    activeSessionId,
    sendMessage,
    newChat,
    loadSession,
    deleteSession,
  };
}
