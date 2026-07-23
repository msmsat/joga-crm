import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './Journal.css';
import type { Booking } from './types';
import type { LessonCreate } from '../../../api/schedule/schedule.types';
import { scheduleApi } from '../../../api/schedule';
import { errorMessage } from '../../../api/errorMessage';
import { indexToDateTime, toDateStr } from './utils';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useSchedule, useJournalDays } from './hooks/useSchedule';
import { useJournalMutations } from './hooks/useJournalMutations';
import { useUndoHistory } from './hooks/useUndoHistory';
import { usePopupPosition } from './hooks/usePopupPosition';
import { Toolbar } from './components/Toolbar';
import { DaySummary } from './components/DaySummary';
import { RightPanel } from './components/RightPanel';
import { Grid } from './components/ScheduleGrid/Grid';
import { GridSkeleton } from './components/ScheduleGrid/GridSkeleton';
import { LoadError } from './components/LoadError';
import { BookingPopup } from './components/BookingPopup';
import { NewBookingModal } from './components/modals/NewBookingModal';
import { AddClientModal } from './components/modals/AddClientModal';
import { useToast, ConfirmModal } from '../../../components/ui/index';
import { getUserRoleFromToken } from '../../../utils/auth';

  // ─── ГЛАВНЫЙ КОМПОНЕНТ ────────────────────────────────────────────────────────
export default function Journal() {
  const { t } = useTranslation('journal');
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const today = new Date();

  // 1. СНАЧАЛА ОБЪЯВЛЯЕМ ВСЕ СТЕЙТЫ (Чтобы TypeScript их видел)
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [selectedDay, setSelectedDay] = useState(today.getDate());
  const [activeTrainers, setActiveTrainers] = useState<number[]>([]);
  const [activeHalls, setActiveHalls] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'trainers' | 'halls'>('trainers');
  const [popupBooking, setPopupBooking] = useState<Booking | null>(null);
  // 🔥 Черновик редактирования живёт здесь — карточка в сетке рисует его живьём (задача 4 V4-4)
  const [isEditingBooking, setIsEditingBooking] = useState(false);
  const [editForm, setEditForm] = useState({ serviceId: null as number | null, title: '', hall: '', maxClients: '8', timeStart: 0, timeEnd: 0 });
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalBooking] = useState<Booking | null>(null);
  const [newBookingSlot, setNewBookingSlot] = useState<{ trainer: number; timeStart: number; timeEnd: number; columnIndex?: number } | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  // 🔥 Стейт формы создания живёт здесь — сетка получает живой объект для превью (задача 3 V4-4)
  const [newForm, setNewForm] = useState({ serviceId: null as number | null, title: '', hall: '', maxClients: '8' });
  const [timeStep, setTimeStep] = useState<number>(15); // 🔥 Шаг времени в минутах (по умолчанию 15)
  // 🔥 СТЕЙТЫ ДЛЯ УМНОГО ВВОДА ВРЕМЕНИ
  const [calendarView, setCalendarView] = useState<'day' | 'week'>('day');
  // Владелец и администратор редактируют журнал напрямую; тренер — только просмотр (ТЗ 2.3).
  const canEdit = getUserRoleFromToken() !== 'trainer';

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionReason, setTransitionReason] = useState<'date' | 'mode' | 'view' | null>(null);

  const [isEditingDate, setIsEditingDate] = useState(false);
  const [dateInputVal, setDateInputVal] = useState("");
  // Компактная шапка колонок при скролле расписания (гистерезис против дребезга)
  const [compactHeaders, setCompactHeaders] = useState(false);
  // Отмена занятия с записанными клиентами — сначала подтверждение (задача 5)
  const [confirmCancelBooking, setConfirmCancelBooking] = useState<Booking | null>(null);


  // 2. ДАЛЕЕ ИДУТ УТИЛИТЫ И ФУНКЦИИ

  const toast = useToast();
  // Проп-контракт showToast(msg) уходит в глубь дерева (drag&drop, попап,
  // карточка) — там вперемешку и успехи, и предупреждения («нет прав»), без
  // разделения на успех/ошибку в самом контракте, поэтому info (нейтральный);
  // однозначные ошибки (.catch у мутаций) вызывают toast.error(...) напрямую.
  const showToast = React.useCallback((msg: string) => toast.info(msg), [toast]);

  // Реальные данные: тренеры (Сотрудники), залы, занятия за видимый диапазон
  const { trainers, halls, bookings, isFirstLoad, lessonsKey, loadError, isFirstLoadError, refetchAll } =
    useSchedule(calYear, calMonth, selectedDay, calendarView);
  const journalDays = useJournalDays(calYear, calMonth);
  const hallNames = halls.map(h => h.name);
  const mutations = useJournalMutations(lessonsKey);
  const history = useUndoHistory();

  // Обратный вызов истории упал (409: место занято вторым админом, занятие уже
  // отменено и т.п.) — error-тост с причиной; entry уже выкинута хуком.
  const handleHistoryError = React.useCallback((label: string, e: unknown) => {
    toast.error(t('toasts.undoRedoError', { label, message: errorMessage(e, t) }));
  }, [toast, t]);

  const handleUndo = React.useCallback(() => {
    void history.undo(handleHistoryError).then(label => {
      if (label) showToast(t('toasts.undoLabel', { label }));
    });
  }, [history, handleHistoryError, showToast, t]);

  const handleRedo = React.useCallback(() => {
    void history.redo(handleHistoryError).then(label => {
      if (label) showToast(t('toasts.redoLabel', { label }));
    });
  }, [history, handleHistoryError, showToast, t]);

  // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z — не перехватываем ввод текста в полях (задача 4).
  useEffect(() => {
    if (!canEdit) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      else if ((key === 'y') || (key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [canEdit, handleUndo, handleRedo]);

  // При загрузке данных включаем все колонки/залы в фильтрах
  useEffect(() => { setActiveTrainers(trainers.map(t => t.id)); }, [trainers]);
  useEffect(() => { setActiveHalls(halls.map(h => h.name)); }, [halls]);

  // Фоновая ошибка (данные в кэше уже есть — сетка на экране, refetch просто
  // не удался): не ломаем сетку, только тост. Первую загрузку ловит LoadError.
  const prevLoadErrorRef = useRef<unknown>(null);
  useEffect(() => {
    if (loadError && loadError !== prevLoadErrorRef.current && !isFirstLoadError) {
      toast.error(errorMessage(loadError, t));
    }
    prevLoadErrorRef.current = loadError;
  }, [loadError, isFirstLoadError, toast, t]);

  const { previewRef, modalRef, gridWrapperRef, popupRef, newFormPos, popupPos } = usePopupPosition({
    popupBooking,
    isEditingBooking,
    editFormTimeStart: editForm.timeStart,
    editFormTimeEnd: editForm.timeEnd,
    editFormHall: editForm.hall,
    showNewForm,
    newBookingSlot
  });

  const withAnimation = (reason: 'date' | 'mode' | 'view', action: () => void) => {
    setTransitionReason(reason);
    setIsTransitioning(true);
    setTimeout(() => {
      action();
      setIsTransitioning(false);
    }, 250);
  };

  // 🔥 Генерируем 7 дней текущей недели
  const getWeekDays = () => {
    const date = new Date(calYear, calMonth, selectedDay);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Смещение к понедельнику
    const monday = new Date(date.setDate(diff));
    
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  };

  // ── Колонки по режиму (Если неделя - отдаем даты, иначе тренеров/залы) ──
  const columns = calendarView === 'week' 
    ? getWeekDays()
    : (viewMode === 'trainers'
      ? trainers.filter(t => activeTrainers.includes(t.id))
      : hallNames.filter(h => activeHalls.includes(h)));
  
  const activeBookings = bookings;

  // ── Фильтрованные записи ──
  const filteredBookings = activeBookings.filter(b => {
    if (viewMode === 'trainers') return activeTrainers.includes(b.trainer);
    return activeHalls.includes(b.hall);
  });

  const closeNewForm = () => {
    setShowNewForm(false);
    setNewBookingSlot(null);
    setNewForm({ serviceId: null, title: '', hall: hallNames[0] ?? '', maxClients: '8' });
  };

  // ── Открыть форму нового слота (Всегда 1 час или заполнить остаток) ──
  const openNewSlot = (
    trainerIdx: number,
    timeIdx: number,
    columnIndex: number // 🔥 ДОБАВИЛИ ЭТОТ ПАРАМЕТР
  ) => {
    const blockStart = timeIdx;
    const blockEnd   = timeIdx + 1;

    // 🔥 Сохраняем индекс колонки в стейт
    setNewBookingSlot({ trainer: trainerIdx, timeStart: blockStart, timeEnd: blockEnd, columnIndex });
    setNewForm({ serviceId: null, title: '', hall: hallNames[0] ?? '', maxClients: '8' });
    setShowNewForm(true);
  };

  // Превью прыгает в колонку выбранного тренера/зала (задача 3 V4-4): в
  // режиме «Тренеры» источник — newBookingSlot.trainer, в «Залы» — newForm.hall.
  // Вычисляется при рендере (не в эффекте) — производное значение, не стейт.
  // В недельном виде колонки — даты, columnIndex менять некому.
  const liveNewBookingSlot = React.useMemo(() => {
    if (!newBookingSlot || calendarView === 'week') return newBookingSlot;
    const idx = viewMode === 'trainers'
      ? (columns as typeof trainers).findIndex(t => t.id === newBookingSlot.trainer)
      : (columns as string[]).findIndex(h => h === newForm.hall);
    return idx !== -1 && idx !== newBookingSlot.columnIndex
      ? { ...newBookingSlot, columnIndex: idx }
      : newBookingSlot;
  }, [newBookingSlot, calendarView, viewMode, newForm.hall, columns]);

  // Черновик редактирования умирает при смене/закрытии попапа (другое занятие
  // открыто или popupBooking стал null) — карточка мгновенно возвращается к
  // серверным данным. Сброс во время рендера (не в эффекте): React.dev
  // рекомендует именно так гасить локальный стейт при смене «ключевого» пропа.
  const prevPopupIdRef = useRef<number | null | undefined>(popupBooking?.id);
  if (prevPopupIdRef.current !== popupBooking?.id) {
    prevPopupIdRef.current = popupBooking?.id;
    if (isEditingBooking) setIsEditingBooking(false);
  }

  // Закрытие popup при клике вне
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      
      // 🔥 ФИКС: Если мы кликнули по элементу (например, времени), и он тут же исчез из DOM — игнорируем!
      if (!document.contains(target)) return;

      // 1. Если кликнули внутри попапа (по кнопке) — не закрываем, пусть кнопка отработает
      if (popupRef.current && popupRef.current.contains(target)) return;

      // 2. Если кликнули по любой карточке занятия — игнорируем! 
      if (target.closest('.booking-card')) return;

      // 3. В остальных случаях (клик по фону, пустой сетке, тулбару) — закрываем окно
      setPopupBooking(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Мини-календарь ──
  const changeMonth = (dir: number) => {
    let m = calMonth + dir;
    let y = calYear;
    if (m > 11) { m = 0; y++; }
    if (m < 0) { m = 11; y--; }
    setCalMonth(m);
    setCalYear(y);
  };

  const changeDay = (dir: number) => {
    // 🔥 Если режим недели, то шагаем по 7 дней, иначе по 1
    const step = calendarView === 'week' ? dir * 7 : dir; 
    const targetDate = new Date(calYear, calMonth, selectedDay + step);
    
    setCalYear(targetDate.getFullYear());
    setCalMonth(targetDate.getMonth());
    setSelectedDay(targetDate.getDate());
  };

  // Diff двух карточек → payload PATCH (общий для forward- и backward-хода правки).
  const diffPayload = React.useCallback((prev: Booking, next: Booking): Partial<LessonCreate> => {
    const payload: Partial<LessonCreate> = {};
    if (next.date && (next.timeStart !== prev.timeStart || next.date !== prev.date)) {
      payload.start_time = indexToDateTime(next.date, next.timeStart);
    }
    if (next.timeEnd - next.timeStart !== prev.timeEnd - prev.timeStart) {
      payload.duration_min = Math.round((next.timeEnd - next.timeStart) * 60);
    }
    if (next.trainer !== prev.trainer) payload.teacher_id = next.trainer;
    if (next.hall !== prev.hall) {
      const hall = halls.find(h => h.name === next.hall);
      if (hall) payload.hall_id = hall.id;
    }
    if (next.serviceId !== prev.serviceId && next.serviceId != null) payload.service_id = next.serviceId;
    if (next.maxClients !== prev.maxClients) payload.total_spots = next.maxClients;
    return payload;
  }, [halls]);

  // ── Прямое сохранение переноса/растягивания: diff → PATCH, оптимизм и откат — в useJournalMutations ──
  const commitBookingChange = React.useCallback((prev: Booking, next: Booking) => {
    const payload = diffPayload(prev, next);
    if (Object.keys(payload).length === 0) return;

    mutations.updateLesson(prev, next, payload)
      .then(() => {
        showToast(t('toasts.lessonUpdated'));
        history.push({
          label: t('toasts.historyLabels.moveLesson'),
          undo: async () => {
            const backPayload = diffPayload(next, prev);
            if (Object.keys(backPayload).length > 0) await mutations.updateLesson(next, prev, backPayload);
            setPopupBooking(pb => (pb && pb.id === prev.id ? prev : pb));
          },
          redo: async () => {
            const fwdPayload = diffPayload(prev, next);
            if (Object.keys(fwdPayload).length > 0) await mutations.updateLesson(prev, next, fwdPayload);
            setPopupBooking(pb => (pb && pb.id === next.id ? next : pb));
          },
        });
      })
      .catch((e: unknown) => {
        setPopupBooking(pb => (pb && pb.id === prev.id ? prev : pb));
        toast.error(errorMessage(e, t));
      });
  }, [diffPayload, mutations, showToast, toast, history]);

  const { drag, wasDragging, initDrag } = useDragAndDrop({
    bookings,
    viewMode,
    calendarView,
    columns,
    timeStep,
    showToast,
    onCommit: commitBookingChange
  });

  const handleDateInputSubmit = () => {
    setIsEditingDate(false);
    const clean = dateInputVal.trim();
    if (!clean) return;

    // Разделяем ввод по точкам, слэшам, тире или пробелам
    const parts = clean.split(/[\.\/\-\s]+/);
    if (parts.length === 0) return;

    let day = parseInt(parts[0], 10);
    // Если месяц не ввели, берем текущий открытый месяц
    let month = parts[1] ? parseInt(parts[1], 10) - 1 : calMonth;
    // Если год не ввели, берем текущий открытый год
    let year = parts[2] ? parseInt(parts[2], 10) : calYear;

    // Если ввели короткий год (например, 26 вместо 2026), превращаем его в 2026
    if (parts[2] && parts[2].length === 2) {
      year = 2000 + year;
    }

    const parsedDate = new Date(year, month, day);

    // Проверяем, что дата реальная (чтобы не пропустить какой-нибудь 32-й мартобря)
    if (!isNaN(parsedDate.getTime()) && parsedDate.getDate() === day && parsedDate.getMonth() === month) {
      setCalYear(parsedDate.getFullYear());
      setCalMonth(parsedDate.getMonth());
      setSelectedDay(parsedDate.getDate());
    } else {
      toast.error(t('invalidDateFormat'));
    }
  };

  // ── Тоггл тренера ──
  const toggleTrainer = (id: number) => {
    setActiveTrainers(prev =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter(t => t !== id) : prev) : [...prev, id]
    );
  };

  // ── Тоггл зала ──
  const toggleHall = (h: string) => {
    setActiveHalls(prev =>
      prev.includes(h) ? (prev.length > 1 ? prev.filter(x => x !== h) : prev) : [...prev, h]
    );
  };
  
  // ── Открыть popup записи ──
  const openBookingPopup = (e: React.MouseEvent, booking: Booking) => {
    e.stopPropagation();
    setPopupBooking(booking);
  };

  // ── Отмена занятия: единственная необратимая операция (каскад по клиентам +
  // уведомления) — отложенный коммит, задача 5. Карточка гаснет мгновенно;
  // реальный cancelLesson стреляет только по истечении undo-тоста (onExpire)
  // или страховкой (уход со страницы/закрытие вкладки), «Отменить» в тосте —
  // на сервер не ходит вовсе. Осознанно НЕ кладём в общий undo-стек (задача 3):
  // до коммита операция обратима через сам undo-тост, после коммита — необратима.
  const deferredCancelRef = useRef<Map<number, { commit: () => void; committed: boolean }>>(new Map());

  const runDeferredCancel = React.useCallback((lessonId: number) => {
    const entry = deferredCancelRef.current.get(lessonId);
    if (!entry || entry.committed) return;
    entry.committed = true;
    entry.commit();
    deferredCancelRef.current.delete(lessonId);
  }, []);

  // Страховка: уход со страницы (размонт Журнала) коммитит все ещё тикающие отмены.
  useEffect(() => () => {
    deferredCancelRef.current.forEach((entry, id) => { if (!entry.committed) runDeferredCancel(id); });
  }, [runDeferredCancel]);

  // Страховка: закрытие вкладки/обновление страницы — тот же немедленный коммит.
  useEffect(() => {
    const onBeforeUnload = () => {
      deferredCancelRef.current.forEach((entry, id) => { if (!entry.committed) runDeferredCancel(id); });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [runDeferredCancel]);

  // Страховка: листание дня/недели меняет видимый диапазон — отменённое
  // занятие может «уехать» с экрана при живом таймере, коммитим сразу.
  const lessonsKeyStr = JSON.stringify(lessonsKey);
  const isFirstLessonsKey = useRef(true);
  useEffect(() => {
    if (isFirstLessonsKey.current) { isFirstLessonsKey.current = false; return; }
    deferredCancelRef.current.forEach((entry, id) => { if (!entry.committed) runDeferredCancel(id); });
  }, [lessonsKeyStr, runDeferredCancel]);

  const startDeferredCancel = React.useCallback(async (booking: Booking) => {
    // Ждём патч кэша ДО показа тоста: клик «Отменить» раньше, чем снапшот
    // получен, оставил бы rollback без данных для отката.
    const snapshot = await mutations.patchLocalCancelled(booking);

    const entry = {
      committed: false,
      commit: () => {
        mutations.commitDeferredCancel(booking.id).catch((e: unknown) => {
          // Сервер упал уже после истечения тоста — откатить кэш + сообщить.
          mutations.rollback(snapshot);
          toast.error(errorMessage(e, t));
        });
      },
    };
    deferredCancelRef.current.set(booking.id, entry);

    toast.undo(t('toasts.lessonCancelled'), {
      // Страховка могла закоммитить это занятие немедленно (уход со страницы,
      // листание дня) уже ПОСЛЕ того как тост стартовал (React-эффект и
      // JS-таймер тоста независимы) — клик «Отменить» тогда не должен трогать
      // кэш: коммит уже реально ушёл на сервер.
      onUndo: () => {
        if (entry.committed) return;
        deferredCancelRef.current.delete(booking.id);
        mutations.rollback(snapshot);
      },
      onExpire: () => runDeferredCancel(booking.id),
    });
  }, [mutations, toast, runDeferredCancel]);

  const deleteBooking = (id: number) => {
    const booking = bookings.find(b => b.id === id);
    setPopupBooking(null);
    if (!booking) return;
    if (booking.status === 'cancelled') {
      toast.info(t('toasts.alreadyCancelled'));
      return;
    }
    if (booking.clients > 0) {
      setConfirmCancelBooking(booking);
      return;
    }
    startDeferredCancel(booking);
  };

  // ── Создать занятие на сервере (данные формы приходят из модалки) ──
  const createLessonFromModal = (form: { serviceId: number; title: string; hall: string; maxClients: number }) => {
    if (!newBookingSlot) return;
    const trainer = trainers.find(t => t.id === newBookingSlot.trainer);
    if (!trainer) {
      toast.error(t('toasts.selectTrainer'));
      return;
    }
    // В недельном виде колонка слота — дата, в дневном — выбранный день
    const col = newBookingSlot.columnIndex != null ? columns[newBookingSlot.columnIndex] : null;
    const dateStr = col instanceof Date ? toDateStr(col) : toDateStr(new Date(calYear, calMonth, selectedDay));
    const hall = halls.find(h => h.name === form.hall);

    // Временная карточка для оптимистичного рендера — invalidate после успеха
    // заменит её реальной (с настоящим id) из ответа сервера.
    const optimisticBooking: Booking = {
      id: -Date.now(),
      trainer: newBookingSlot.trainer,
      timeStart: newBookingSlot.timeStart,
      timeEnd: newBookingSlot.timeEnd,
      title: form.title,
      hall: form.hall,
      clients: 0,
      maxClients: form.maxClients,
      color: trainer.color,
      status: 'confirmed',
      date: dateStr,
      cancelReason: null,
      clientsNotified: false,
      serviceId: form.serviceId,
    };

    const createPayload: LessonCreate = {
      service_id: form.serviceId,
      teacher_id: newBookingSlot.trainer,
      hall_id: hall?.id ?? null,
      start_time: indexToDateTime(dateStr, newBookingSlot.timeStart),
      duration_min: Math.round((newBookingSlot.timeEnd - newBookingSlot.timeStart) * 60),
      total_spots: form.maxClients,
    };

    mutations.createLesson(createPayload, optimisticBooking)
      .then(({ next }) => {
        showToast(t('toasts.lessonAdded'));
        // redo создаёт НОВЫЙ id — entry замыкает его в изменяемой ref-переменной,
        // чтобы последующий undo удалял актуальное занятие, а не первое созданное.
        let liveId = next!.id;
        history.push({
          label: t('toasts.historyLabels.createLesson'),
          undo: async () => { await scheduleApi.deleteLesson(liveId); },
          redo: async () => {
            const { next: recreated } = await mutations.createLesson(createPayload, { ...optimisticBooking, id: -Date.now() });
            liveId = recreated!.id;
          },
        });
      })
      .catch((e: unknown) => toast.error(errorMessage(e, t)));
  };

  // Оптимизм — по одному клиенту, последовательно (не пачкой параллельно):
  // частичный успех вида «2 из 3» должен оставить в кэше ровно те +1, что
  // реально прошли, а next.clients каждого шага — считаться от актуального
  // booking, а не от значения на момент открытия модалки.
  const confirmAddClients = async (clientIds: number[]) => {
    // Вместо addModalBooking используем текущее активное окно popupBooking
    if (!popupBooking) return;
    const lessonId = popupBooking.id;

    let current = popupBooking;
    const succeeded: { clientId: number; reservationId: number }[] = [];
    let firstError: unknown = null;

    for (const id of clientIds) {
      try {
        const { next, reservationId } = await mutations.addReservation(id, current);
        current = next!;
        succeeded.push({ clientId: id, reservationId });
      } catch (e) {
        if (!firstError) firstError = e;
      }
    }

    if (succeeded.length === clientIds.length) {
      showToast(t('toasts.clientsBooked', { count: succeeded.length }));
    } else {
      toast.error(t('toasts.clientsBookedPartial', {
        success: succeeded.length,
        total: clientIds.length,
        error: errorMessage(firstError, t),
      }));
    }

    if (succeeded.length === 0) return;

    let liveReservations = succeeded;
    history.push({
      label: succeeded.length === 1 ? t('toasts.historyLabels.bookClient') : t('toasts.historyLabels.bookClients', { count: succeeded.length }),
      undo: async () => {
        for (const r of liveReservations) {
          const booking = bookings.find(b => b.id === lessonId) ?? current;
          await mutations.cancelReservation(r.reservationId, booking);
        }
      },
      redo: async () => {
        const next: { clientId: number; reservationId: number }[] = [];
        for (const r of liveReservations) {
          const booking = bookings.find(b => b.id === lessonId) ?? current;
          const { reservationId } = await mutations.addReservation(r.clientId, booking);
          next.push({ clientId: r.clientId, reservationId });
        }
        liveReservations = next;
      },
    });
  };

  // ── Статистика дня ──
  const totalClasses = filteredBookings.length;
  const totalClients = filteredBookings.reduce((s, b) => s + b.clients, 0);
  const avgLoad = filteredBookings.length > 0
    ? Math.round(filteredBookings.reduce((s, b) => s + (b.maxClients > 0 ? b.clients / b.maxClients : 0), 0) / filteredBookings.length * 100)
    : 0;

  return (
    <>

      {/* Стало: */}
      <div className={`j-root ${drag ? 'is-dragging-global' : ''}`}>
        <div className="j-main">

          {/* ── ТУЛБАР ── */}
          <Toolbar
            trainers={trainers}
            halls={hallNames}
            selectedDay={selectedDay}
            calMonth={calMonth}
            calYear={calYear}
            viewMode={viewMode}
            activeTrainers={activeTrainers}
            activeHalls={activeHalls}
            calendarView={calendarView}
            isEditingDate={isEditingDate}
            dateInputVal={dateInputVal}
            changeDay={(dir) => withAnimation('date', () => changeDay(dir))}
            setViewMode={(m) => withAnimation('mode', () => setViewMode(m))}
            setCalendarView={(v) => withAnimation('view', () => setCalendarView(v))}
            onGoToToday={() => withAnimation('date', () => {
              setSelectedDay(today.getDate());
              setCalMonth(today.getMonth());
              setCalYear(today.getFullYear());
            })}
            toggleTrainer={toggleTrainer}
            toggleHall={toggleHall}
            handleDateInputSubmit={handleDateInputSubmit}
            setIsEditingDate={setIsEditingDate}
            setDateInputVal={setDateInputVal}
          />

          {/* ── СВОДКА ДНЯ ── */}
          <DaySummary
            totalClasses={totalClasses}
            totalClients={totalClients}
            avgLoad={avgLoad}
            activeTrainersCount={trainers.filter(t => activeTrainers.includes(t.id)).length}
            timeStep={timeStep}
            setTimeStep={setTimeStep}
            canEdit={canEdit}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            undoLabel={history.undoLabel}
            redoLabel={history.redoLabel}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />

          {/* ── СЕТКА ── */}
          <div className="j-layout">
            <div
              className={`j-grid-wrapper${compactHeaders ? ' j-hdr-compact' : ''}`}
              ref={gridWrapperRef}
              onScroll={e => {
                const st = e.currentTarget.scrollTop;
                setCompactHeaders(prev => (prev ? st > 8 : st > 56));
              }}
            >
              {isFirstLoadError ? (
                <LoadError
                  message={errorMessage(loadError, t)}
                  onRetry={refetchAll}
                />
              ) : isFirstLoad ? (
                <GridSkeleton columns={columns.length || 4} />
              ) : (
                <Grid
                  isTransitioning={isTransitioning}
                  transitionReason={transitionReason} // 🔥 Передаем причину в Сетку
                  calendarView={calendarView}
                  columns={columns}
                  viewMode={viewMode}
                  filteredBookings={filteredBookings}
                  hoveredSlot={hoveredSlot}
                  setHoveredSlot={setHoveredSlot}
                  canEdit={canEdit}
                  showNewForm={showNewForm}
                  popupBooking={popupBooking}
                  drag={drag}
                  wasDragging={wasDragging}
                  openNewSlot={openNewSlot}
                  newBookingSlot={liveNewBookingSlot}
                  newForm={newForm}
                  previewRef={previewRef}
                  initDrag={initDrag}
                  setPopupBooking={setPopupBooking}
                  openBookingPopup={openBookingPopup}
                  showToast={showToast}
                  editDraft={isEditingBooking && popupBooking ? { bookingId: popupBooking.id, title: editForm.title, timeStart: editForm.timeStart, timeEnd: editForm.timeEnd } : null}
                />
              )}
            </div>

            {/* ── ПРАВАЯ ПАНЕЛЬ ── */}
            <div className="j-right">
              <RightPanel
                trainers={trainers}
                halls={halls}
                calMonth={calMonth}
                calYear={calYear}
                selectedDay={selectedDay}
                today={today}
                activeHalls={activeHalls}
                activeBookings={activeBookings}
                filteredBookings={filteredBookings}
                changeMonth={changeMonth}
                setSelectedDay={setSelectedDay}
                toggleHall={toggleHall}
                calendarView={calendarView}
                eventDays={journalDays}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── ПРЕМИАЛЬНЫЙ POPUP КАРТОЧКИ ЗАПИСИ ── */}
      {popupBooking && (
        <BookingPopup
          trainers={trainers}
          halls={hallNames}
          popupBooking={popupBooking}
          popupRef={popupRef}
          popupPos={popupPos}
          canEdit={canEdit}
          timeStep={timeStep}
          setPopupBooking={setPopupBooking}
          isEditingBooking={isEditingBooking}
          setIsEditingBooking={setIsEditingBooking}
          editForm={editForm}
          setEditForm={setEditForm}
          mutations={mutations}
          onSave={commitBookingChange}
          deleteBooking={deleteBooking}
          onAddClients={confirmAddClients} // Изменено здесь
          showToast={showToast}
          pushHistoryEntry={history.push}
        />
      )}

      {/* ── ФОРМА НОВОГО ЗАНЯТИЯ (PREMIUM KEYPAD) ── */}
      {showNewForm && newBookingSlot && (
        <NewBookingModal
          trainers={trainers}
          halls={hallNames}
          newBookingSlot={newBookingSlot}
          setNewBookingSlot={setNewBookingSlot}
          newForm={newForm}
          setNewForm={setNewForm}
          newFormPos={newFormPos}
          modalRef={modalRef}
          timeStep={timeStep}
          closeNewForm={closeNewForm}
          onCreate={createLessonFromModal}
        />
      )}

      {showAddModal && addModalBooking && (
        <AddClientModal
          booking={addModalBooking}
          onClose={() => setShowAddModal(false)}
          onAdd={confirmAddClients}
        />
      )}

      {confirmCancelBooking && (
        <ConfirmModal
          title={t('cancelBookingConfirm.title')}
          message={t('cancelBookingConfirm.message', { count: confirmCancelBooking.clients })}
          confirmText={t('cancelBookingConfirm.confirm')}
          danger
          onConfirm={() => startDeferredCancel(confirmCancelBooking)}
          onClose={() => setConfirmCancelBooking(null)}
        />
      )}
    </>
  );
}