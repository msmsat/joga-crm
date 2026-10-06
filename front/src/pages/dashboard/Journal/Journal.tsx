import { SourceJournalModal } from './bumpix/SourceJournalModal';
import { inGrid } from './bumpix/model';
import type { SourceJournalItem } from './bumpix/types';
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { useAiEntity } from '../../../hooks/useAiEntity';
import { useTranslation } from 'react-i18next';
import './Journal.css';
import type { Booking } from './types';
import type { LessonCreate } from '../../../api/schedule/schedule.types';
import { scheduleApi } from '../../../api/schedule';
import { errorMessage } from '../../../api/errorMessage';
import { indexToDateTime, toDateStr, formatIndexToTimeStr, parseTimeToIndex } from './utils';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useSchedule, useJournalDays } from './hooks/useSchedule';
import { useJournalMutations } from './hooks/useJournalMutations';
import { useResourceMove } from './hooks/useResourceMove';
import { useUndoHistory } from './hooks/useUndoHistory';
import { usePopupPosition } from './hooks/usePopupPosition';
import { usePrefetchLesson } from './hooks/useLessonDetail';
import { useLessonPurge } from './hooks/useLessonPurge';
import { useGridSwipe } from './hooks/useGridSwipe';
import { useTrainerPages } from './hooks/useTrainerPages';
import { TrainerPicker } from './components/TrainerPicker';
import { WeekTrainerPicker } from './components/WeekTrainerPicker';
import { useJournalView, selectWeekSchedule } from './hooks/useJournalView';
import { Toolbar } from './components/Toolbar';
import { MobileFilters } from './components/MobileFilters';
import { MiniCalendar } from './components/MiniCalendar';
import { DayControls } from './components/DayControls';
import { RightPanel } from './components/RightPanel';
import { Grid } from './components/ScheduleGrid/Grid';
import { GridSkeleton } from './components/ScheduleGrid/GridSkeleton';
import { LoadError } from './components/LoadError';
import { BookingPopup } from './components/BookingPopup';
import type { LessonDraft } from './components/lesson/editor/editorModel';
import { NO_HALL_COLUMN } from './constants';
import { useServiceOptions } from './hooks/useServiceOptions';
import { NewBookingModal } from './components/modals/NewBookingModal';
import type { NewBookingForm } from './components/modals/NewBookingModal';
import { ResourceBookingModal } from './components/modals/ResourceBookingModal';
import { isPastSlot, nextSameTime } from './components/modals/booking-wizard/pastSlot';
import { ResourceKeypadModal } from './components/modals/ResourceKeypadModal';
import { usePhone } from '../../../hooks/usePhone';
import { AddClientModal } from './components/modals/AddClientModal';
import { useToast, ConfirmModal, Button } from '../../../components/ui/index';
import { getUserRoleFromToken } from '../../../utils/auth';
import { useAiIntent } from '../../../hooks/useAiIntent';
import { useBusinessTerms } from '../../../hooks/useBusinessTerms';

// Журнал помнит выбранный день между перезагрузками
const JOURNAL_DATE_KEY = 'journal:selectedDate';
/** Сколько закрытый попап занятия доигрывает уход (Journal.css: popup-out,
 *  popup-sheet-out) — с запасом на последний кадр. */
const POPUP_EXIT_MS = 260;

/** Отмена занятия, ждущая конца undo-тоста (см. startDeferredCancel). */
interface DeferredCancel {
  commit: () => Promise<boolean>;
  committed: boolean;
  /** Разрешить тост сейчас — как по таймеру: он уходит и коммитит отмену. */
  settleToast?: () => void;
}

  // ─── ГЛАВНЫЙ КОМПОНЕНТ ────────────────────────────────────────────────────────
export default function Journal() {
  const { t, i18n } = useTranslation('journal');
  const { calendarView, setCalendarView, weekTrainerId, setWeekTrainerId } = useJournalView();
  // «Сегодня» — одна ссылка на день: мемоизированный календарь иначе
  // перерисовывался бы на каждый рендер журнала ради нового объекта Date.
  const todayKey = toDateStr(new Date());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const today = useMemo(() => new Date(), [todayKey]);

  // Открываем день из ?date=YYYY-MM-DD (переходы из Отчётов ведут на конкретную
  // дату), иначе — последний открытый день из localStorage. Парсим по частям,
  // чтобы new Date не сдвинул день из-за UTC. Битое значение → сегодня.
  const initialDate = React.useMemo(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('date');
    const [y, m, d] = (fromUrl ?? localStorage.getItem(JOURNAL_DATE_KEY) ?? '').split('-').map(Number);
    return (y && m && d) ? new Date(y, m - 1, d) : today;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1. СНАЧАЛА ОБЪЯВЛЯЕМ ВСЕ СТЕЙТЫ (Чтобы TypeScript их видел)
  const [calMonth, setCalMonth] = useState(initialDate.getMonth());
  const [calYear, setCalYear] = useState(initialDate.getFullYear());
  const [selectedDay, setSelectedDay] = useState(initialDate.getDate());
  // Фильтры колонок храним «от обратного» — что пользователь СКРЫЛ. Список
  // тренеров пересобирается на каждое листание дня (useMemo от bookings в
  // useSchedule), и прежнее сидирование «включить всех» сбрасывало выбор при
  // каждом переключении. Скрытые id переживают смену списка, а новая колонка
  // (сотрудник, ведущий занятие только в этом дне) появляется сразу видимой.
  const [hiddenTrainers, setHiddenTrainers] = useState<number[]>([]);
  const [hiddenHalls, setHiddenHalls] = useState<string[]>([]);
  // Фильтры записей по месту и услуге — из панели фильтров телефона. Колонки
  // они не прячут, только занятия в них; десктоп их не выставляет вовсе.
  const [hallFilter, setHallFilter] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState<number | null>(null);
  const [pickedViewMode, setPickedViewMode] = useState<'trainers' | 'halls'>('trainers');
  // Участвует ли место (зал/кресло/кабинет) в расписании: отрасль студии плюс
  // тумблер владельца, посчитанные сервером. У барбершопа клиент записывается
  // к мастеру, и кресло не должно быть ни колонкой, ни фильтром, ни рядом
  // чипов в форме. `undefined` — термины ещё не пришли.
  const { spaceIsAxis } = useBusinessTerms();
  // Режим «Залы» запираем, а не просто прячем вкладку: иначе владелец,
  // оставивший его включённым до выключения оси, вернулся бы в журнал с
  // колонками, которых уже не выбрать обратно.
  const viewMode = calendarView === 'week' || spaceIsAxis === false ? 'trainers' : pickedViewMode;
  const setViewMode = setPickedViewMode;
  const [sourceModal, setSourceModal] = useState<{initial?: SourceJournalItem} | null>(null);
  const [popupBooking, setPopupBooking] = useState<Booking | null>(null);
  // Ассистенту: какое занятие открыто — «сколько здесь мест» в журнале
  // спрашивают про занятие, а в каталоге про зал.
  useAiEntity('lesson', popupBooking?.id ?? null);
  // 🔥 Черновик редактирования живёт здесь — карточка в сетке рисует его живьём (задача 4 V4-4)
  const [isEditingBooking, setIsEditingBooking] = useState(false);
  // Закрытый попап ещё POPUP_EXIT_MS доигрывает уход — тем же экземпляром и в
  // том же режиме (правка остаётся правкой), а не исчезает в тот же кадр.
  // Закрывают его из десятка мест (клик мимо, крестик, смахивание, удаление,
  // смена мастера недели), поэтому уход держится здесь, а не в каждом из них.
  const [closingPopup, setClosingPopup] = useState<{ booking: Booking; editing: boolean } | null>(null);
  const [prevPopup, setPrevPopup] = useState<Booking | null>(popupBooking);
  if (prevPopup !== popupBooking) {
    setPrevPopup(popupBooking);
    if (!popupBooking && prevPopup) setClosingPopup({ booking: prevPopup, editing: isEditingBooking });
    else if (popupBooking && closingPopup) setClosingPopup(null);
  }
  useEffect(() => {
    if (!closingPopup) return;
    const timer = window.setTimeout(() => setClosingPopup(null), POPUP_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [closingPopup]);
  const shownPopup = popupBooking ?? closingPopup?.booking ?? null;
  const [editForm, setEditForm] = useState<LessonDraft>({ serviceId: null, title: '', hall: '', maxClients: '8', timeStart: 0, timeEnd: 0, date: '', trainer: 0 });
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalBooking] = useState<Booking | null>(null);
  const [newBookingSlot, setNewBookingSlot] = useState<{ trainer: number; timeStart: number; timeEnd: number; columnIndex?: number; bufferAfter?: number } | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newBookingDate, setNewBookingDate] = useState('');
  const [pastChoice, setPastChoice] = useState<{
    suggested: { date: string; time: string };
    apply: (when: { date: string; time: string }) => void;
    own: () => void;
  } | null>(null);
  const pastAccepted = useRef(false);
  // Индивидуальная запись открывается из двух мест, и оба уже знают контекст:
  // с клетки сетки — мастер и день, из тулбара — только день. Форма без этого
  // спрашивала всё заново, хотя человек ровно что кликнул по колонке мастера.
  const [resourceBooking, setResourceBooking] = useState<{
    teacherId: number | null; date: string; serviceId?: number; time?: string;
  } | null>(null);
  // Та же индивидуальная запись, но у клетки сетки на десктопе — клавиатурным
  // окном, как новое занятие. На телефоне окно у клетки негде разместить: там
  // остаётся шит (resourceBooking).
  const [keypadResource, setKeypadResource] = useState<{
    teacherId: number | null; date: string; time: string; serviceId?: number;
  } | null>(null);
  const isPhone = usePhone();
  // Кнопка индивидуальной записи появляется, только когда такая услуга есть:
  // иначе она вела бы в форму без единого варианта.
  const { services: journalServices, onlyResourceServices } = useServiceOptions();
  const hasResourceServices = journalServices.some(s => s.booking_mode === 'resource' && s.is_bookable);
  // 🔥 Стейт формы создания живёт здесь — сетка получает живой объект для превью (задача 3 V4-4)
  const [newForm, setNewForm] = useState<NewBookingForm>({ serviceId: null, title: '', hall: '', maxClients: '8', branchId: null });
  const [timeStep, setTimeStep] = useState<number>(15); // 🔥 Шаг времени в минутах (по умолчанию 15)
  // 🔥 СТЕЙТЫ ДЛЯ УМНОГО ВВОДА ВРЕМЕНИ
  // Владелец и администратор редактируют журнал напрямую; тренер — только просмотр (ТЗ 2.3).
  const canEdit = getUserRoleFromToken() !== 'trainer';

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionReason, setTransitionReason] = useState<'date' | 'mode' | 'view' | null>(null);
  // Листаем назад — содержимое въезжает слева, а не справа, как при «вперёд».
  const [slideBack, setSlideBack] = useState(false);

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
  const { trainers, sourceItems, staffBlocks, dateFrom, halls, bookings, isFirstLoad, lessonsKey, loadError, isFirstLoadError, refetchAll } =
    useSchedule(calYear, calMonth, selectedDay, calendarView);
  const weekSchedule = React.useMemo(
    () => selectWeekSchedule(trainers, bookings, staffBlocks, weekTrainerId),
    [trainers, bookings, staffBlocks, weekTrainerId],
  );
  useEffect(() => {
    // Do not replace a remembered choice while the team is still loading.
    if (calendarView === 'week' && !isFirstLoad && weekSchedule.trainer && weekSchedule.trainer.id !== weekTrainerId) {
      setWeekTrainerId(weekSchedule.trainer.id);
    }
  }, [calendarView, isFirstLoad, weekSchedule.trainer, weekTrainerId, setWeekTrainerId]);
  // Точки мини-календаря считаем с учётом фильтра тренеров — в режиме «Залы»
  // сетка тренеров не фильтрует, значит и точки гасить нечем.
  const journalDays = useJournalDays(calYear, calMonth, calendarView === 'week'
    ? trainers.filter(trainer => trainer.id !== weekSchedule.trainer?.id).map(trainer => trainer.id)
    : viewMode === 'trainers' ? hiddenTrainers : []);
  const hallNames = useMemo(() => halls.map(h => h.name), [halls]);
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

  // Запоминаем выбранный день — при перезагрузке журнал откроется на нём же
  useEffect(() => {
    localStorage.setItem(JOURNAL_DATE_KEY, toDateStr(new Date(calYear, calMonth, selectedDay)));
  }, [calYear, calMonth, selectedDay]);

  // Видимые колонки: всё, что пользователь не скрыл в тулбаре/правой панели.
  // Списки ниже — useMemo: по ним мемоизированные сетка и панель решают,
  // перерисовываться ли. Новый массив на каждый рендер журнала (а журнал
  // перерисовывается от каждого открытия попапа и каждой буквы в форме)
  // перерисовывал бы их целиком.
  const visibleTrainers = useMemo(() => (calendarView === 'week'
    ? (weekSchedule.trainer ? [weekSchedule.trainer] : [])
    : trainers.filter(t => !hiddenTrainers.includes(t.id))), [calendarView, weekSchedule.trainer, trainers, hiddenTrainers]);
  // Телефон: колонки тренеров во всю ширину, лишние — на следующих страницах
  const trainerPages = useTrainerPages(visibleTrainers);
  // HB-22 п.4: колонка «Без зала» появляется, только если такие занятия есть —
  // пустая колонка на каждом экране была бы шумом.
  const visibleHalls = useMemo(() => [
    ...hallNames.filter(h => !hiddenHalls.includes(h)),
    ...(bookings.some(b => !b.hall) ? [NO_HALL_COLUMN] : []),
  ], [hallNames, hiddenHalls, bookings]);

  // Фоновая ошибка (данные в кэше уже есть — сетка на экране, refetch просто
  // не удался): не ломаем сетку, только тост. Первую загрузку ловит LoadError.
  const prevLoadErrorRef = useRef<unknown>(null);
  useEffect(() => {
    if (loadError && loadError !== prevLoadErrorRef.current && !isFirstLoadError) {
      toast.error(errorMessage(loadError, t));
    }
    prevLoadErrorRef.current = loadError;
  }, [loadError, isFirstLoadError, toast, t]);

  const { previewRef, modalRef, gridWrapperRef, popupRef } = usePopupPosition({
    popupBooking,
    isEditingBooking,
    editFormTimeStart: editForm.timeStart,
    editFormTimeEnd: editForm.timeEnd,
    editFormHall: editForm.hall,
    showNewForm,
    newBookingSlot
  });

  // Уход попапа — классом прямо в DOM, без перерисовки самого попапа (он под
  // memo и на время ухода заморожен): перерисовка ~400 элементов ради класса
  // стоила бы кадра в самом начале анимации. Клики по уходящему попапу
  // гасятся перехватом, а не наследуемым pointer-events — тот заставил бы
  // браузер пересчитать стили всех его элементов в тот же кадр.
  useLayoutEffect(() => {
    const el = popupRef.current;
    if (!closingPopup || !el) return;
    const swallow = (e: Event) => { e.stopPropagation(); e.preventDefault(); };
    const blocked = ['click', 'mousedown', 'pointerdown', 'touchstart'] as const;
    el.classList.add('is-leaving');
    el.setAttribute('aria-hidden', 'true');
    blocked.forEach(type => el.addEventListener(type, swallow, true));
    return () => {
      el.classList.remove('is-leaving');
      el.removeAttribute('aria-hidden');
      blocked.forEach(type => el.removeEventListener(type, swallow, true));
    };
  }, [closingPopup, popupRef]);

  const withAnimation = (reason: 'date' | 'mode' | 'view', action: () => void) => {
    setTransitionReason(reason);
    setIsTransitioning(true);
    setTimeout(() => {
      action();
      setIsTransitioning(false);
    }, 250);
  };

  // ── Колонки по режиму (Если неделя - отдаем даты, иначе тренеров/залы) ──
  // 🔥 В неделе — 7 дней текущей недели
  const pageTrainers = trainerPages.pageTrainers;
  const columns = useMemo(() => {
    if (calendarView !== 'week') return viewMode === 'trainers' ? pageTrainers : visibleHalls;
    const date = new Date(calYear, calMonth, selectedDay);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Смещение к понедельнику
    const monday = new Date(date.setDate(diff));

    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [calendarView, viewMode, pageTrainers, visibleHalls, calYear, calMonth, selectedDay]);

  // Живые занятия (без отменённых) — считаются в сводке дня и правой панели;
  // сетка (Grid) рисует всё подряд через filteredBookings, отменённые остаются на месте.
  const activeBookings = useMemo(
    () => (calendarView === 'week' ? weekSchedule.bookings : bookings).filter(b => !b.source && b.status !== 'cancelled'),
    [calendarView, weekSchedule.bookings, bookings],
  );

  // ── Фильтрованные записи (для сетки — включают отменённые) ──
  const filteredBookings = useMemo(() => (calendarView === 'week' ? weekSchedule.bookings : bookings.filter(b => {
    if (hallFilter !== null && b.hall !== hallFilter) return false;
    if (serviceFilter !== null && b.serviceId !== serviceFilter) return false;
    if (viewMode === 'trainers') return !hiddenTrainers.includes(b.trainer);
    return !hiddenHalls.includes(b.hall);
  })), [calendarView, weekSchedule.bookings, bookings, hallFilter, serviceFilter, viewMode, hiddenTrainers, hiddenHalls]);

  const liveBookings = useMemo(() => filteredBookings.filter(b => !b.source && b.status !== 'cancelled'), [filteredBookings]);

  // Форма создания уходит анимацией (useLeave) — превью в сетке гаснет вместе
  // с ней, а не исчезает рывком, когда форма уже ушла.
  const fadeNewPreview = () => previewRef.current?.classList.add('is-leaving');
  const closeNewForm = () => {
    setShowNewForm(false);
    setKeypadResource(null);
    setNewBookingSlot(null);
    setNewForm({ serviceId: null, title: '', hall: hallNames[0] ?? '', maxClients: '8', branchId: null });
  };

  // Превью в сетке следует за окном индивидуальной записи: название услуги и
  // взятое время. Стабильная ссылка — окно зовёт её из эффекта.
  const previewResource = React.useCallback(({ title, start, end, bufferAfter = 0 }: { title: string; start?: number; end?: number; bufferAfter?: number }) => {
    setNewForm(f => (f.title === title ? f : { ...f, title }));
    if (start != null && end != null) {
      setNewBookingSlot(s => (s && (s.timeStart !== start || s.timeEnd !== end || s.bufferAfter !== bufferAfter)
        ? { ...s, timeStart: start, timeEnd: end, bufferAfter } : s));
    }
  }, []);

  // Дата формы и день журнала идут вместе; после создания показываем день целиком.
  const showBookingDate = React.useCallback((date: string, showDay = true) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const [year, month, day] = date.split('-').map(Number);
    setCalYear(year); setCalMonth(month - 1); setSelectedDay(day);
    if (showDay) setCalendarView('day');
  }, [setCalendarView]);
  // Занятие перенесли на другой день из его карточки — журнал идёт следом,
  // не меняя вида (неделя остаётся неделей).
  const showLessonDate = React.useCallback((date: string) => showBookingDate(date, false), [showBookingDate]);
  const bookingCreated = (date?: string) => {
    if (date) showBookingDate(date);
    mutations.invalidate();
  };
  const requestWhen = (date: string, time: string,
    apply: (when: { date: string; time: string }) => void, own: () => void) => {
    if (!isPastSlot(date, time)) { apply({ date, time }); return; }
    pastAccepted.current = false;
    setPastChoice({ suggested: nextSameTime(time), apply, own });
  };
  const openCreation = (scope: { trainer: number; columnIndex: number; hall: string; date: string; time: string }, own = false) => {
    setPopupBooking(null);
    showBookingDate(scope.date);
    if (isPhone) {
      setResourceBooking({ teacherId: scope.trainer || null, date: scope.date, time: own ? undefined : scope.time });
      return;
    }
    const trainer = scope.trainer || trainerPages.pageTrainers[0]?.id || visibleTrainers[0]?.id || 0;
    const columnIndex = viewMode === 'trainers'
      ? Math.max(0, trainerPages.pageTrainers.findIndex(item => item.id === trainer))
      : Math.max(0, visibleHalls.indexOf(scope.hall));
    const start = parseTimeToIndex(scope.time);
    if (onlyResourceServices) setKeypadResource({ teacherId: trainer || null, date: scope.date, time: own ? '' : scope.time });
    setNewBookingDate(scope.date);
    setNewBookingSlot({ trainer, timeStart: start, timeEnd: Math.min(start + 1, 16), columnIndex });
    setNewForm({ serviceId: null, title: '', hall: scope.hall, maxClients: '8', branchId: null });
    setShowNewForm(true);
  };
  const openNewSlot = (trainerIdx: number, timeIdx: number, columnIndex: number) => {
    if (calendarView === 'week' && !weekSchedule.trainer) return;
    const column = columns[columnIndex];
    const scope = {
      trainer: calendarView === 'week' ? weekSchedule.trainer!.id
        : column && typeof column === 'object' && !(column instanceof Date) ? column.id : (trainerIdx || 0),
      columnIndex, hall: typeof column === 'string' ? column : (visibleHalls[0] ?? hallNames[0] ?? ''),
      date: toDateStr(column instanceof Date ? column : new Date(calYear, calMonth, selectedDay)),
      time: formatIndexToTimeStr(timeIdx),
    };
    if (scope.trainer < 0) return;
    requestWhen(scope.date, scope.time,
      when => openCreation({ ...scope, ...when }),
      () => openCreation({ ...scope, date: toDateStr(new Date()) }, true));
  };
  const changeNewDate = (date: string) => {
    if (!newBookingSlot || !date) return;
    const time = formatIndexToTimeStr(newBookingSlot.timeStart);
    requestWhen(date, time, when => {
      setNewBookingDate(when.date); showBookingDate(when.date);
      const start = parseTimeToIndex(when.time);
      setNewBookingSlot(slot => slot && { ...slot, timeStart: start, timeEnd: start + slot.timeEnd - slot.timeStart });
    }, () => { const today = toDateStr(new Date()); setNewBookingDate(today); showBookingDate(today); });
  };
  const slotNotBefore = () => {
    const today = toDateStr(new Date());
    if (newBookingDate > today) return null;
    const now = new Date();
    return newBookingDate < today ? Infinity : now.getHours() - 7 + now.getMinutes() / 60;
  };
  const changeNewTime = (time: string) => {
    requestWhen(newBookingDate, time, when => {
      setNewBookingDate(when.date); showBookingDate(when.date);
      const start = parseTimeToIndex(when.time);
      setNewBookingSlot(slot => slot && { ...slot, timeStart: start, timeEnd: Math.max(slot.timeEnd, start + 0.25) });
    }, () => { const today = toDateStr(new Date()); setNewBookingDate(today); showBookingDate(today); });
  };

  // Ассистент: /dashboard/journal?ai=lesson.create (эпик AI-6, задача 9).
  // Слот тот же, что при клике по пустой ячейке: первая колонка и ближайший
  // целый час сетки — время и тренера человек всё равно правит в самой форме.
  // На телефоне («+» каркаса ведёт сюда же) — мастер записи без подстановок:
  // ни времени, ни мастера человек не называл, подставлять их нечем.
  useAiIntent('lesson.create', () => {
    if (isPhone) {
      setResourceBooking({ teacherId: null, date: toDateStr(new Date(calYear, calMonth, selectedDay)) });
      return;
    }
    const hour = new Date().getHours();
    const timeIdx = Math.min(Math.max(hour - 7, 0), 13);
    openNewSlot(0, timeIdx, 0);
  });

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

      // 1b. Модалки кита живут в портале на <body>, то есть формально «вне
      // попапа» — но открывает их сам попап, и клик по ним идёт ВНУТРЬ того,
      // что он же и показал. Без этого исключения окно QR-кода и подтверждение
      // «Создать услугу?» закрывались на первом же mousedown в любом месте:
      // попап исчезал вместе с ними, и кнопка не успевала получить click —
      // «нажал скопировать, окно закрылось, ничего не скопировалось».
      // Так же и список кита (`Select`, портал на <body>): выбор услуги в окне
      // правки закрывал бы весь попап раньше, чем дойдёт до click.
      if (target.closest('.v-overlay, .modal-overlay, .lc-attend-pop, .v-select-panel')) return;

      // 2. Если кликнули по любой карточке занятия — игнорируем! 
      if (target.closest('.booking-card')) return;

      // 3. В остальных случаях (клик по фону, пустой сетке, тулбару) — закрываем окно
      setPopupBooking(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [popupRef]);

  // ── Мини-календарь ──
  const changeMonth = useCallback((dir: number) => {
    let m = calMonth + dir;
    let y = calYear;
    if (m > 11) { m = 0; y++; }
    if (m < 0) { m = 11; y--; }
    setCalMonth(m);
    setCalYear(y);
  }, [calMonth, calYear]);

  const changeDay = (dir: number) => {
    // 🔥 Если режим недели, то шагаем по 7 дней, иначе по 1
    const step = calendarView === 'week' ? dir * 7 : dir; 
    const targetDate = new Date(calYear, calMonth, selectedDay + step);
    
    setCalYear(targetDate.getFullYear());
    setCalMonth(targetDate.getMonth());
    setSelectedDay(targetDate.getDate());
  };

  // Перелистывание стрелками тулбара и свайпом по неделе: одна анимация,
  // направление которой совпадает с направлением шага.
  const stepDate = (dir: number) => {
    setSlideBack(dir < 0);
    withAnimation('date', () => changeDay(dir));
  };
  // Страница тренеров листается той же анимацией, что и дата.
  const stepTrainerPage = (dir: number) => {
    const next = trainerPages.page + dir;
    if (next < 0 || next >= trainerPages.pageCount) return;
    setSlideBack(dir < 0);
    withAnimation('date', () => trainerPages.setPage(next));
  };
  const pagedTrainers = calendarView === 'day' && viewMode === 'trainers' && trainerPages.pageCount > 1;
  useGridSwipe(
    gridWrapperRef,
    !isTransitioning && (calendarView === 'week' || pagedTrainers),
    dir => (calendarView === 'week' ? stepDate(dir) : stepTrainerPage(dir)),
  );

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

  // Индивидуальная запись меняет время только переносом — со своей историей,
  // уведомлением клиента и пересчётом суммы при смене мастера.
  const commitResourceMove = useResourceMove({
    halls, mutations, pushHistory: history.push, setPopupBooking, showToast,
  });

  // ── Прямое сохранение переноса/растягивания: diff → PATCH, оптимизм и откат — в useJournalMutations ──
  const commitBookingChange = React.useCallback(async (prev: Booking, next: Booking): Promise<boolean> => {
    if (prev.bookingMode === 'resource') return commitResourceMove(prev, next);
    const payload = diffPayload(prev, next);
    if (Object.keys(payload).length === 0) return true;

    return mutations.updateLesson(prev, next, payload)
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
        return true;
      })
      .catch((e: unknown) => {
        setPopupBooking(pb => (pb && pb.id === prev.id ? prev : pb));
        toast.error(errorMessage(e, t));
        return false;
      });
  }, [diffPayload, mutations, showToast, toast, history, t, commitResourceMove]);

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
    const parts = clean.split(/[./\-\s]+/);
    if (parts.length === 0) return;

    const day = parseInt(parts[0], 10);
    // Если месяц не ввели, берем текущий открытый месяц
    const month = parts[1] ? parseInt(parts[1], 10) - 1 : calMonth;
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

  // ── Тоггл тренера (последнюю видимую колонку скрыть нельзя — сетка опустеет) ──
  const toggleTrainer = (id: number) => {
    setHiddenTrainers(prev =>
      prev.includes(id) ? prev.filter(x => x !== id)
        : (visibleTrainers.length > 1 ? [...prev, id] : prev)
    );
  };

  // ── Тоггл зала ──
  const visibleHallCount = visibleHalls.length;
  const toggleHall = useCallback((h: string) => {
    setHiddenHalls(prev =>
      prev.includes(h) ? prev.filter(x => x !== h)
        : (visibleHallCount > 1 ? [...prev, h] : prev)
    );
  }, [visibleHallCount]);

  // ── Открыть popup записи ──
  // Стабильные ссылки: обе уходят в каждую карточку сетки (они мемоизированы).
  const openBookingPopup = useCallback((e: React.MouseEvent, booking: Booking) => {
    e.stopPropagation();
    if (booking.source) { setPopupBooking(null); setSourceModal({initial:booking.source}); return; }
    setSourceModal(null);
    setPopupBooking(booking);
  }, []);
  const prefetchLesson = usePrefetchLesson();

  // ── Отмена занятия: единственная необратимая операция (каскад по клиентам +
  // уведомления) — отложенный коммит, задача 5. Карточка гаснет мгновенно;
  // реальный cancelLesson стреляет только по истечении undo-тоста (onExpire)
  // или страховкой (уход со страницы/закрытие вкладки), «Отменить» в тосте —
  // на сервер не ходит вовсе. Осознанно НЕ кладём в общий undo-стек (задача 3):
  // до коммита операция обратима через сам undo-тост, после коммита — необратима.
  const deferredCancelRef = useRef<Map<number, DeferredCancel>>(new Map());
  // Отмены, ушедшие на сервер и ещё не ответившие: «Удалить навсегда» ждёт их.
  const cancelCommitsRef = useRef<Map<number, Promise<boolean>>>(new Map());

  // Отдаёт, принял ли сервер отмену; отмены не было вовсе — true.
  const runDeferredCancel = React.useCallback((lessonId: number): Promise<boolean> => {
    const entry = deferredCancelRef.current.get(lessonId);
    if (!entry || entry.committed) return cancelCommitsRef.current.get(lessonId) ?? Promise.resolve(true);
    entry.committed = true;
    deferredCancelRef.current.delete(lessonId);
    const done = entry.commit().finally(() => cancelCommitsRef.current.delete(lessonId));
    cancelCommitsRef.current.set(lessonId, done);
    return done;
  }, []);

  // Страховка: уход со страницы (размонт Журнала) коммитит все ещё тикающие отмены.
  useEffect(() => () => {
    deferredCancelRef.current.forEach((entry, id) => { if (!entry.committed) void runDeferredCancel(id); });
  }, [runDeferredCancel]);

  // Страховка: закрытие вкладки/обновление страницы — тот же немедленный коммит.
  useEffect(() => {
    const onBeforeUnload = () => {
      deferredCancelRef.current.forEach((entry, id) => { if (!entry.committed) void runDeferredCancel(id); });
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
    deferredCancelRef.current.forEach((entry, id) => { if (!entry.committed) void runDeferredCancel(id); });
  }, [lessonsKeyStr, runDeferredCancel]);

  const startDeferredCancel = React.useCallback(async (booking: Booking) => {
    // Ждём патч кэша ДО показа тоста: клик «Отменить» раньше, чем снапшот
    // получен, оставил бы rollback без данных для отката.
    const snapshot = await mutations.patchLocalCancelled(booking);

    const entry: DeferredCancel = {
      committed: false,
      commit: () => mutations.commitDeferredCancel(booking.id).then(() => true, (e: unknown) => {
        // Сервер упал уже после истечения тоста — откатить кэш + сообщить.
        mutations.rollback(snapshot);
        toast.error(errorMessage(e, t));
        return false;
      }),
    };
    deferredCancelRef.current.set(booking.id, entry);

    entry.settleToast = toast.undo(t('toasts.lessonCancelled'), {
      // Страховка могла закоммитить это занятие немедленно (уход со страницы,
      // листание дня) уже ПОСЛЕ того как тост стартовал (React-эффект и
      // JS-таймер тоста независимы) — клик «Отменить» тогда не должен трогать
      // кэш: коммит уже реально ушёл на сервер.
      onUndo: () => {
        if (entry.committed) return;
        deferredCancelRef.current.delete(booking.id);
        mutations.rollback(snapshot);
      },
      onExpire: () => { void runDeferredCancel(booking.id); },
    });
  }, [mutations, toast, runDeferredCancel, t]);

  // «Удалить навсегда» таймера не ждёт: отмена уходит на сервер сейчас, а тост
  // уходит вместе с ней — его «Отменить» после коммита уже ничего не вернёт.
  const settleCancelNow = React.useCallback((lessonId: number) => {
    deferredCancelRef.current.get(lessonId)?.settleToast?.();
    return runDeferredCancel(lessonId);
  }, [runDeferredCancel]);
  const closePopup = useCallback(() => setPopupBooking(null), []);
  const purgeLesson = useLessonPurge({ mutations, settleCancel: settleCancelNow, closePopup });

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
  const createLessonFromModal = async (form: {
    serviceId: number; title: string; hall: string; maxClients: number; branchId: number | null;
    notes: string; photos: string[]; price: number;
  }): Promise<boolean> => {
    if (!newBookingSlot) return false;
    const trainer = trainers.find(t => t.id === newBookingSlot.trainer);
    if (!trainer) {
      toast.error(t('toasts.selectTrainer'));
      return false;
    }
    // В недельном виде колонка слота — дата, в дневном — выбранный день
    const dateStr = newBookingDate;
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
      notes: form.notes,
      photos: form.photos,
      serviceId: form.serviceId,
      // Ровно та сумма, что человек видел в форме. Сервер посчитает её заново
      // по тренеру занятия — и обязан сойтись; карточка живёт до ответа.
      price: form.price,
      // Этот путь создаёт СОБЫТИЕ. Индивидуальная запись идёт через quote и
      // confirm (ResourceBookingModal), а не через создание занятия.
      bookingMode: 'event',
      version: 1,
      // Филиал даёт зал, а где места нет в расписании — форма: у барбершопа
      // кресло не выбирают, и вывести филиал больше неоткуда.
      branchId: hall?.branch_id ?? form.branchId,
    };

    const createPayload: LessonCreate = {
      service_id: form.serviceId,
      teacher_id: newBookingSlot.trainer,
      hall_id: hall?.id ?? null,
      branch_id: hall ? null : form.branchId,
      start_time: indexToDateTime(dateStr, newBookingSlot.timeStart),
      duration_min: Math.round((newBookingSlot.timeEnd - newBookingSlot.timeStart) * 60),
      total_spots: form.maxClients,
      notes: form.notes,
      photos: form.photos,
    };

    return mutations.createLesson(createPayload, optimisticBooking)
      .then(({ next }) => {
        showToast(t('toasts.lessonAdded'));
        showBookingDate(dateStr);
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
        return true;
      })
      .catch((e: unknown) => { toast.error(errorMessage(e, t)); return false; });
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
    setPopupBooking(booking => booking?.id === lessonId ? { ...booking, clients: current.clients } : booking);

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

  return (
    <>

      {/* Стало: */}
      {/* Класс — только когда карточку уже тащат, а не на каждое нажатие:
          он висит на корне и через `.is-dragging-global *` пересчитывал
          стили всей страницы дважды на любой клик по занятию (нажали —
          повесили, отпустили — сняли). Это и было главным тормозом открытия. */}
      <div className={`j-root ${drag?.isDragging ? 'is-dragging-global' : ''}`}>
        <div className="j-main">

          {/* ── ТУЛБАР ── */}
          <Toolbar
            trainers={trainers}
            halls={hallNames}
            selectedDay={selectedDay}
            calMonth={calMonth}
            calYear={calYear}
            viewMode={viewMode}
            activeTrainers={visibleTrainers.map(t => t.id)}
            activeHalls={visibleHalls}
            calendarView={calendarView}
            isEditingDate={isEditingDate}
            dateInputVal={dateInputVal}
            changeDay={stepDate}
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
            onResourceBooking={hasResourceServices
              ? () => setResourceBooking({ teacherId: calendarView === 'week' ? weekSchedule.trainer?.id ?? null : null, date: toDateStr(new Date(calYear, calMonth, selectedDay)) })
              : undefined}
            spaceIsAxis={spaceIsAxis}
            weekTrainerPicker={
              <WeekTrainerPicker trainers={trainers} selected={weekSchedule.trainer}
                onSelect={id => { setWeekTrainerId(id); setPopupBooking(null); }} />
            }
            trainerPicker={calendarView === 'day' && viewMode === 'trainers' ? (
              <TrainerPicker
                trainers={visibleTrainers}
                selectedIds={trainerPages.selectedIds}
                onChange={trainerPages.setSelectedIds}
              />
            ) : undefined}
            mobileCalendar={
              <MiniCalendar
                calMonth={calMonth} calYear={calYear} selectedDay={selectedDay}
                today={today} changeMonth={changeMonth} setSelectedDay={setSelectedDay}
                calendarView={calendarView} eventDays={journalDays}
              />
            }
            mobileFilters={calendarView === 'day' ? (
              <MobileFilters
                trainers={trainers}
                halls={hallNames}
                services={journalServices}
                // Мастер в панели один: выбран, когда видна ровно одна колонка
                trainer={hiddenTrainers.length > 0 && visibleTrainers.length === 1 ? visibleTrainers[0].id : null}
                hall={hallFilter}
                service={serviceFilter}
                onTrainer={(id) => {
                  setHiddenTrainers(id === null ? [] : trainers.filter(tr => tr.id !== id).map(tr => tr.id));
                  if (id !== null) setWeekTrainerId(id);
                }}
                onHall={setHallFilter}
                onService={setServiceFilter}
                spaceIsAxis={spaceIsAxis}
              />
            ) : undefined}
            // Сводку дня (занятия, записи, загрузка) владелец убрал: она
            // отнимала у расписания строку. Шаг и отмена — в верхний ряд.
            controls={canEdit ? (
              <DayControls
                timeStep={timeStep}
                setTimeStep={setTimeStep}
                canUndo={history.canUndo}
                canRedo={history.canRedo}
                undoLabel={history.undoLabel}
                redoLabel={history.redoLabel}
                onUndo={handleUndo}
                onRedo={handleRedo}
              />
            ) : undefined}
          />

      {sourceItems && sourceItems.length > 0 && <div style={{padding:'8px 0',display:'flex',justifyContent:'flex-end'}}>
        <Button variant="dark" size="sm" onClick={()=>{setPopupBooking(null);setSourceModal({});}}>{t('bumpix:journal.range', {count:sourceItems.length})}</Button>
      </div>}

          {filteredBookings.some(b=>!b.source && !inGrid(b)) && <div style={{display:'flex',gap:8,flexWrap:'wrap',padding:'8px 0'}}>
            <span>{t('bumpix:journal.outside')}</span>
            {filteredBookings.filter(b=>!b.source && !inGrid(b)).map(b=><div key={b.id} data-booking-id={b.id}>
              <Button variant="ghost" size="sm" onClick={()=>{setSourceModal(null);setPopupBooking(b);}}>{b.date} · {formatIndexToTimeStr(b.timeStart)} · {b.title}</Button>
            </div>)}
          </div>}
          {/* ── СЕТКА ── */}
          <div className="j-layout">
            <div
              className={`j-grid-wrapper${compactHeaders ? ' j-hdr-compact' : ''}${slideBack ? ' j-slide-back' : ''}`}
              ref={gridWrapperRef}
              onScroll={e => {
                // На телефоне и на небольшом экране шапка колонок не сжимается:
                // она и так тонкая (только имя, Journal.css), а перестройка на
                // ходу уменьшала имена и двигала их под взглядом.
                if (window.matchMedia('(max-width: 1440px), (max-height: 860px)').matches) return;
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
                  pages={pagedTrainers ? { count: trainerPages.pageCount, index: trainerPages.page } : undefined}
                  isTransitioning={isTransitioning}
                  transitionReason={transitionReason} // 🔥 Передаем причину в Сетку
                  calendarView={calendarView}
                  columns={columns}
                  viewMode={viewMode}
                  filteredBookings={filteredBookings.filter(inGrid)}
                  staffBlocks={calendarView === 'week' ? weekSchedule.staffBlocks : staffBlocks}
                  dayDate={dateFrom}
                  visibleTrainers={visibleTrainers}
                  canEdit={canEdit}
                  gestures={!isPhone}
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
                  prefetchLesson={prefetchLesson}
                  editDraft={isEditingBooking && popupBooking ? { bookingId: popupBooking.id, title: editForm.title, timeStart: editForm.timeStart, timeEnd: editForm.timeEnd } : null}
                />
              )}
            </div>

            {/* ── ПРАВАЯ ПАНЕЛЬ ── */}
            <div className="j-right">
              <RightPanel
                trainers={calendarView === 'week' ? visibleTrainers : trainers}
                halls={halls}
                calMonth={calMonth}
                calYear={calYear}
                selectedDay={selectedDay}
                today={today}
                activeHalls={visibleHalls}
                activeBookings={activeBookings}
                filteredBookings={liveBookings}
                changeMonth={changeMonth}
                setSelectedDay={setSelectedDay}
                toggleHall={toggleHall}
                calendarView={calendarView}
                spaceIsAxis={spaceIsAxis}
                eventDays={journalDays}
              />
            </div>
          </div>
        </div>
      </div>

      {sourceModal && <SourceJournalModal items={sourceItems ?? []} initial={sourceModal.initial} onClose={()=>setSourceModal(null)}/>}

      {/* ── ПРЕМИАЛЬНЫЙ POPUP КАРТОЧКИ ЗАПИСИ ── */}
      {shownPopup && (
        <BookingPopup
          key={shownPopup.id}
          trainers={trainers.filter(tr=>tr.role !== 'Bumpix')}
          halls={halls}
          spaceIsAxis={spaceIsAxis}
          onShowDate={showLessonDate}
          popupBooking={shownPopup}
          popupRef={popupRef}
          leaving={!popupBooking}
          canEdit={canEdit}
          timeStep={timeStep}
          setPopupBooking={setPopupBooking}
          isEditingBooking={popupBooking ? isEditingBooking : closingPopup?.editing ?? false}
          setIsEditingBooking={setIsEditingBooking}
          editForm={editForm}
          setEditForm={setEditForm}
          mutations={mutations}
          onSave={commitBookingChange}
          deleteBooking={deleteBooking}
          purgeLesson={purgeLesson}
          onAddClients={confirmAddClients} // Изменено здесь
          showToast={showToast}
          pushHistoryEntry={history.push}
        />
      )}

      {/* ── ФОРМА НОВОГО ЗАНЯТИЯ (PREMIUM KEYPAD) ── */}
      {showNewForm && newBookingSlot && keypadResource && (
        <ResourceKeypadModal
          trainers={trainers.filter(tr=>tr.role !== 'Bumpix')}
          teacherId={keypadResource.teacherId}
          defaultTime={keypadResource.time}
          defaultDate={keypadResource.date}
          defaultServiceId={keypadResource.serviceId}
          timeStep={timeStep}
          modalRef={modalRef}
          onClose={closeNewForm}
          onLeaving={fadeNewPreview}
          onCreated={bookingCreated}
          onDateChange={showBookingDate}
          onPreview={previewResource}
        />
      )}
      {showNewForm && newBookingSlot && !keypadResource && (
        <NewBookingModal
          trainers={trainers.filter(tr=>tr.role !== 'Bumpix')}
          halls={hallNames}
          newBookingSlot={newBookingSlot}
          setNewBookingSlot={setNewBookingSlot}
          newForm={newForm}
          setNewForm={setNewForm}
          modalRef={modalRef}
          timeStep={timeStep}
          closeNewForm={closeNewForm}
          onLeaving={fadeNewPreview}
          onCreate={createLessonFromModal}
          spaceIsAxis={spaceIsAxis}
          notBefore={slotNotBefore()}
          date={newBookingDate}
          onDateChange={changeNewDate}
          onTimeChange={changeNewTime}
          // Мастера и день забираем ДО закрытия формы: closeNewForm обнуляет слот.
          onResourceBooking={hasResourceServices ? (serviceId) => {
            const slot = newBookingSlot;
            const date = newBookingDate;
            // На десктопе окно остаётся на месте и просто становится записью клиента.
            if (!isPhone) {
              setKeypadResource({ teacherId: slot.trainer, date, time: formatIndexToTimeStr(slot.timeStart), serviceId });
              return;
            }
            closeNewForm();
            setResourceBooking({
              teacherId: slot?.trainer ?? null,
              date: newBookingDate,
              serviceId,
              time: formatIndexToTimeStr(slot.timeStart),
            });
          } : undefined}
        />
      )}

      {/* HB-22: «записать на индивидуальную услугу» — отдельная команда, не
          создание события. Проходит теми же quote/confirm, что Mini-app. */}
      {resourceBooking && (
        <ResourceBookingModal
          teacherId={resourceBooking.teacherId}
          defaultDate={resourceBooking.date}
          defaultServiceId={resourceBooking.serviceId}
          defaultTime={resourceBooking.time}
          onClose={() => setResourceBooking(null)}
          onCreated={bookingCreated}
          onDateChange={showBookingDate}
        />
      )}

      {pastChoice && <ConfirmModal
        title={t('wizard.past.title')}
        message={t('wizard.past.message', {
          date: new Date(`${pastChoice.suggested.date}T12:00:00`).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' }),
          time: pastChoice.suggested.time,
        })}
        confirmText={t('common:buttons.continue')}
        cancelText={t('wizard.past.own')}
        onConfirm={() => { pastAccepted.current = true; const choice = pastChoice; setPastChoice(null); choice.apply(choice.suggested); }}
        onClose={() => { if (!pastAccepted.current) { const choice = pastChoice; setPastChoice(null); choice.own(); } }}
      />}

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
