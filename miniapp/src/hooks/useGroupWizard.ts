import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLessonDays, getLessonsByDate, type LessonResponse } from '../api/lessons';
import type { StudioCatalog } from '../api/studio';
import { useLessonsVersion } from '../lib/revision';
import { dayList, lastBookableDay, studioToday, type IsoDay } from '../lib/slots';
import {
  choose, emptyGroupPick, focusLesson, lessonOf, marksOf, nextGroupStep, openingDay, reconcileGroupTime, withChoice, withDay,
  type DayMarks, type GroupPick,
} from '../lib/groupWizard';
import type { GroupFocus } from '../lib/entry';
import { playDayWave } from '../lib/dayWave';
import { shownStep, stepsFor, type WizardStep } from '../lib/wizard';
import { useLessonBooking } from './useLessonBooking';
import { useTelegram } from './useTelegram';

/** Занятия дня с сервера: под какой филиал взяты и свежие ли. Несвежий день
 *  показывается, пока тихо едет свежий, — лист не мигает скелетом. */
type Day = { scope: number | null; lessons: LessonResponse[] | null; error: boolean; fresh: boolean };

/** Сводка ленты (часы занятий по дням) — так же: под филиал и со свежестью. */
type Summary = { scope: number | null; marks: DayMarks | null; fresh: boolean };

/** Сколько лист выезжает (переход в Sheet) — с запасом. */
const SETTLE_MS = 480;

/** Когда зажечь точки ритма: лист почти сел, главный поток свободен. */
const WAVE_AT_MS = 300;

type Options = {
  catalog: StudioCatalog | null;
  /** Гость дошёл до брони: поднять вход и повторить ту же запись. */
  onNeedAuth: (retry: () => void) => void;
  /** У студии есть группы — сводку дней и первый день можно взять заранее. */
  enabled: boolean;
  /** Филиал, выбранный на главной сейчас: заранее берётся под него. */
  branch: number | null;
};

/**
 * Мастер записи на групповое занятие с главной: время, направление и тренер в
 * любом порядке, итог с ковриком — тем же листом и теми же вкладками, что у
 * индивидуальной записи (`useBookingWizard`).
 *
 * Что совместимо с чем, решает чистая модель (`lib/groupWizard.ts`); здесь —
 * данные и сеть: сводка ленты и занятия дня (по запросу на день, ответы
 * кешируются до следующей брони) и сама запись (`useLessonBooking` — тот же
 * сценарий брони: вход, телефон, абонемент, успех, кофе).
 *
 * ЗАРАНЕЕ, А НЕ ПРИ ОТКРЫТИИ. Сводка и занятия дня, с которого лист откроется,
 * берутся, пока он закрыт. Иначе открытие шло так: лист выезжает на сегодня,
 * следом приходит сводка, день переезжает на ближайший с занятиями — лента
 * едет, список меняется, точки загораются, и всё это поверх анимации самого
 * листа. Теперь день решён до открытия, а свежие данные приезжают тихо,
 * поверх уже показанных.
 */
export function useGroupWizard({ catalog, onNeedAuth, enabled, branch }: Options) {
  const { t } = useTranslation();
  const { vibrateLight, vibrateMedium } = useTelegram();
  const today = studioToday(catalog?.studio.tz_iana);
  const days = useMemo(
    () => dayList(today, lastBookableDay(today, catalog?.rules.booking_window_days)),
    [today, catalog?.rules.booking_window_days],
  );

  const [isOpen, setIsOpen] = useState(false);
  const [rawStep, setStep] = useState<WizardStep>('time');
  // Куда листнули: 1 — вперёд по вкладкам, -1 — назад. Раздел въезжает с этой стороны.
  const [dir, setDir] = useState(1);
  const [pick, setPick] = useState<GroupPick>(() => emptyGroupPick(today));
  // Филиал, с которым лист открыт; `null` — все.
  const [scope, setScope] = useState<number | null>(null);
  const [byDay, setByDay] = useState<Record<IsoDay, Day>>({});
  // Коврик — вместе с занятием, на которое выбран: сменилось занятие — коврика нет.
  const [spot, setSpot] = useState<{ lessonId: number; spot: number } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  // Рефы, а не состояние: их читают ответы сети, а рисовать по ним нечего.
  // `live` — лист открыт (ответ, пришедший после закрытия, выбор не трогает).
  // `pendingLesson` — занятие из QR-кода ждёт свой день: найдётся — выбор
  // сложится в него и лист уйдёт на итог. `dayFixed` — день решён (ссылкой или
  // сводкой до открытия): пришедшая следом сводка его не двигает.
  const live = useRef(false);
  const pendingLesson = useRef<number | null>(null);
  const dayFixed = useRef(false);
  // Лист встал. Пока он выезжает, несвежее не перезапрашивается, если показать
  // уже есть что: ответ, пришедший посреди выезда, перерисовал бы лист в его
  // же анимации — тот самый рывок. Свежее едет сразу после.
  const [quiet, setQuiet] = useState(true);
  const quietTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(quietTimer.current), []);
  // Раздел сменился не тапом, а открытием листа (или QR-кодом) — без перехода:
  // у собранного заранее листа смена раздела в момент выезда иначе проиграла
  // бы уход прошлого раздела прямо в анимации открытия.
  const [instantStep, setInstantStep] = useState(true);

  // Бронь или отмена (здесь или в «Моих занятиях») обесценивает все дни разом:
  // занятые коврики есть в каждом занятии. Правка в рендере, а не эффектом —
  // устаревший день не должен успеть показаться.
  const version = useLessonsVersion();
  const [seenVersion, setSeenVersion] = useState(version);
  if (version !== seenVersion) {
    setSeenVersion(version);
    setByDay({});
    setSummary(null);
  }

  // Под какой филиал данные: закрытый лист — под выбранный на главной сейчас,
  // открытый — под тот, с которым открыт.
  const wanted = isOpen ? scope : branch;
  const firstDay = days[0];
  const lastDay = days[days.length - 1];

  const summaryOk = summary !== null && summary.scope === wanted;
  const summaryFresh = summaryOk && summary.fresh;
  const marks = summaryOk ? summary.marks : undefined;
  useEffect(() => {
    if (!enabled || summaryFresh || (summaryOk && !quiet)) return;
    const forScope = wanted;
    let cancelled = false;
    getLessonDays(firstDay, lastDay, forScope)
      .then((rows) => {
        if (cancelled) return;
        const next = marksOf(rows);
        setSummary({ scope: forScope, marks: next, fresh: true });
        // Лист открылся раньше сводки — день решает она (один раз).
        if (live.current && !dayFixed.current) {
          dayFixed.current = true;
          setPick((current) => ({ ...current, day: openingDay(current, firstDay, days, next) }));
        }
      })
      // Без отметок лента работает как раньше — это украшение, а не условие записи.
      .catch(() => { if (!cancelled) setSummary({ scope: forScope, marks: null, fresh: true }); });
    return () => { cancelled = true; };
  }, [enabled, summaryFresh, summaryOk, quiet, wanted, firstDay, lastDay, days]);

  // День, с которого лист откроется, — по сводке: тот же расчёт, что в `open`.
  const startDay = marks ? openingDay(emptyGroupPick(firstDay), firstDay, days, marks) : firstDay;
  const shownDay = isOpen ? pick.day : startDay;

  const booking = useLessonBooking({
    prepayRequired: catalog?.rules.prepay_required,
    messages: {
      bookError: t('schedule.booking_error'),
      cancelError: t('schedule.cancel_error'),
      cancelSuccess: t('schedule.cancel_success'),
    },
    onNeedAuth,
    // Записались — лист закрывается, дальше успех и кофе поверх главной.
    onBooked: () => close(),
  });

  const dayState = byDay[shownDay];
  const dayOk = dayState !== undefined && dayState.scope === wanted;
  const dayFresh = dayOk && dayState.fresh;
  useEffect(() => {
    // Закрытый лист берёт заранее только день, с которого откроется, — когда
    // его уже назвала сводка: иначе первым ушёл бы запрос за сегодняшним днём,
    // который тут же окажется не нужен.
    if (!enabled || dayFresh || (!isOpen && !summaryOk) || (dayOk && !quiet)) return;
    const day = shownDay;
    const forScope = wanted;
    let cancelled = false;
    getLessonsByDate(day, { branch_id: forScope })
      .then((lessons) => {
        if (cancelled) return;
        setByDay((prev) => ({ ...prev, [day]: { scope: forScope, lessons, error: false, fresh: true } }));
        if (!live.current) return;
        // Занятие из QR-кода — в первом же пришедшем дне: ссылка открыла именно его.
        const target = pendingLesson.current;
        pendingLesson.current = null;
        const found = target === null ? null : focusLesson(lessons, target);
        // Час, которого в этом дне нет, снимается, когда день приехал.
        setPick((current) => {
          if (current.day !== day) return current;
          const next = reconcileGroupTime(current, lessons);
          return found ? choose(next, found) : next;
        });
        if (found) setStep('summary');
      })
      .catch(() => {
        if (cancelled) return;
        // Свежий запрос не прошёл, а показанный день есть — остаёмся на нём:
        // выбирать по чуть устаревшему лучше, чем смотреть на ошибку.
        setByDay((prev) => {
          const shown = prev[day];
          return shown && shown.scope === forScope && shown.lessons
            ? { ...prev, [day]: { ...shown, fresh: true } }
            : { ...prev, [day]: { scope: forScope, lessons: null, error: true, fresh: true } };
        });
      });
    return () => { cancelled = true; };
  }, [enabled, dayFresh, dayOk, quiet, isOpen, summaryOk, shownDay, wanted]);

  const lessons = dayOk ? dayState.lessons : null;
  const lesson = lessons ? lessonOf(lessons, pick) : null;
  const services = useMemo(
    () => (catalog?.services ?? []).filter((row) => row.booking_mode === 'event'),
    [catalog?.services],
  );
  const staff = useMemo(() => catalog?.staff ?? [], [catalog?.staff]);
  // Тренер один — раздела «Мастер» нет: тренер и так выводится из занятия.
  const steps = stepsFor(staff.length === 1);
  const step = shownStep(rawStep, steps);
  const serviceId = pick.serviceId ?? lesson?.service_id ?? null;
  const teacherId = pick.teacherId ?? lesson?.teacher_id ?? null;
  const selectedSpot = spot && lesson && spot.lessonId === lesson.id ? spot.spot : null;

  const goTo = (next: WizardStep) => {
    const target = shownStep(next, steps);
    setDir(steps.indexOf(target) >= steps.indexOf(step) ? 1 : -1);
    setInstantStep(false);
    setStep(target);
  };

  /** Выбор ведёт дальше: занятие сложилось — на итог, иначе — к тому, что его уточнит. */
  const advance = (next: GroupPick) => {
    setPick(next);
    vibrateLight();
    goTo(nextGroupStep(next, lessons ? lessonOf(lessons, next) : null));
  };

  function close() {
    live.current = false;
    setIsOpen(false);
    // Лист уехал — он снова на «Времени», без коврика: следующее открытие
    // почти всегда отсюда, и собранный заранее лист встречает его готовым.
    // После выезда, а не сразу: иначе подмена была бы видна на уходящем листе.
    window.clearTimeout(quietTimer.current);
    quietTimer.current = window.setTimeout(() => {
      if (live.current) return;
      setInstantStep(true);
      setStep('time');
      setSpot(null);
    }, SETTLE_MS);
  }

  /** `branchId` — филиал с главной; `null` — все. `preset` — что назвал QR-код
   *  студии (`lib/entry.wizardFocusOf`): занятие с днём, направление, тренер. */
  const open = (first: WizardStep, branchId: number | null = null, preset: GroupFocus = {}) => {
    const known = summary !== null && summary.scope === branchId ? summary.marks : null;
    // День ссылки — только если он в ленте: прошедший или за окном записи
    // открыть всё равно не на что. Иначе — день по сводке, если она уже есть.
    const linked = preset.date && days.includes(preset.date) ? preset.date : null;
    const day = linked ?? (known ? openingDay(emptyGroupPick(firstDay), firstDay, days, known) : firstDay);
    live.current = true;
    pendingLesson.current = preset.lessonId ?? null;
    dayFixed.current = linked !== null || preset.lessonId != null || known !== null;
    setScope(branchId);
    // Тот же выбор — тот же объект: собранная заранее вкладка «Время» по нему
    // и узнаёт, что перерисовываться в кадре открытия незачем.
    const next = { ...emptyGroupPick(day), serviceId: preset.serviceId ?? null, teacherId: preset.teacherId ?? null };
    setPick((current) => (
      current.day === next.day && current.time === null && current.lessonId === null
      && current.serviceId === next.serviceId && current.teacherId === next.teacherId ? current : next
    ));
    // Пока лист был закрыт, места могли занять: свежее едет тихо, поверх
    // уже показанного, а не через скелет.
    setByDay((prev) => Object.fromEntries(Object.entries(prev).map(([key, value]) => [key, { ...value, fresh: false }])));
    setSummary((prev) => (prev ? { ...prev, fresh: false } : prev));
    setQuiet(false);
    window.clearTimeout(quietTimer.current);
    quietTimer.current = window.setTimeout(() => setQuiet(true), SETTLE_MS);
    setSpot(null);
    setDir(1);
    setInstantStep(true);
    setStep(first);
    // Точки ритма загораются волной — сигналом под конец выезда: раньше
    // запуск анимаций отнимал кадры у самого листа.
    window.setTimeout(playDayWave, WAVE_AT_MS);
    setIsOpen(true);
    vibrateMedium();
  };

  return {
    isOpen, open, close,
    step, steps, dir, goTo, today, days, pick, scope,
    /** Раздел сменился открытием, а не тапом — показать сразу, без перехода. */
    instantStep,
    /** Лист ещё выезжает: никаких своих движений поверх его анимации. */
    opening: isOpen && !quiet,
    pickDay: (day: IsoDay) => { setPick((current) => withDay(current, day)); vibrateLight(); },
    pickService: (id: number) => advance(withChoice(lessons, pick, { serviceId: id })),
    pickTeacher: (id: number) => advance(withChoice(lessons, pick, { teacherId: id })),
    /** Занятие целиком — карточкой во «Времени» или одно из нескольких в час на итоге. */
    pickLesson: (row: LessonResponse) => advance(choose(pick, row)),
    /** Отметки ленты: `undefined` — ещё грузятся, `null` — недоступны. */
    marks,
    lessons, dayLoading: !dayOk, dayError: Boolean(dayOk && dayState.error),
    retryDay: () => setByDay((prev) => {
      const next = { ...prev };
      delete next[pick.day];
      return next;
    }),
    services, staff,
    /** Названное человеком или выведенное из занятия. */
    serviceId, teacherId,
    service: services.find((row) => row.id === serviceId) ?? null,
    lesson,
    selectedSpot,
    pickSpot: (value: number) => { if (lesson) setSpot({ lessonId: lesson.id, spot: value }); },
    book: () => { if (lesson && selectedSpot) void booking.book(lesson, selectedSpot); },
    cancel: () => { if (lesson) void booking.cancel(lesson); },
    allowRepeat: Boolean(catalog?.rules.repeat_booking_allowed),
    booking,
  };
}

export type GroupWizardFlow = ReturnType<typeof useGroupWizard>;
