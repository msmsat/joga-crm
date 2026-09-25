import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import BookingModal from '../../components/modals/BookingModal';
import PhoneSheet from '../../components/modals/PhoneSheet';
import SubscriptionSheet from '../../components/modals/SubscriptionSheet';
import SuccessModal from '../../components/modals/SuccessModal';
import CoffeeModal from '../../components/modals/CoffeeModal';
import WeekRail from '../../components/schedule/WeekRail';
import LessonCard from '../../components/schedule/LessonCard';
import FilterSheet, { type Filters } from '../../components/schedule/FilterSheet';
import BookingClosedNotice from '../../components/schedule/BookingClosedNotice';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { ListSkeleton } from '../../components/ui/ListSkeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { getLessonsByDate, type LessonResponse } from '../../api/lessons';
import { useTelegram } from '../../hooks/useTelegram';
import { useLessonBooking } from '../../hooks/useLessonBooking';
import { bumpLessons, useLessonsVersion } from '../../lib/revision';
import { ALL_BRANCHES, branchesOfKey, branchKey, knownBranches } from '../../lib/branchSelection';
import type { StudioCatalog } from '../../api/studio';

/** `Date` → `YYYY-MM-DD` без ухода в UTC (иначе вечером день съезжает назад). */
const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

const isSameDay = (a: Date, b: Date) =>
  a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

/**
 * Дни, уже полученные с сервера, и версия занятий, при которой их получили.
 *
 * Листая неделю, человек ходит по одним и тем же дням туда-обратно: вчера —
 * сегодня — вчера. Второй заход обязан рисоваться сразу, а не заказывать тот же
 * день заново и показывать под него скелет. Запрос при этом всё равно уходит —
 * список на экране заменяется молча, когда ответ пришёл (stale-while-revalidate).
 *
 * Модуль, а не состояние: кэш переживает и переключение вкладок, и любой
 * перерендер экрана, ради чего он и заведён.
 *
 * Первая же бронь обесценивает ВСЕ дни разом (занятые места — часть карточки),
 * поэтому при смене версии кэш сбрасывается целиком, а не по одному дню.
 */
const dayCache = new Map<string, LessonResponse[]>();
let cachedVersion = -1;

// Мутация общего кэша принадлежит модулю; вызывается только из эффекта,
// никогда при рендере компонента.
function resetDayCache(version: number) {
  if (cachedVersion !== version) {
    dayCache.clear();
    cachedVersion = version;
  }
}

/** Задержка перед скелетом. Ответ приходит быстрее — и он не появится вовсе. */
const SKELETON_DELAY_MS = 220;

interface EventScheduleProps {
  catalog: StudioCatalog | null;
  /** Отказ 402 ведёт в покупку абонемента — она живёт во вкладке профиля. */
  onBuySubscription: () => void;
  /** Бронь гостя: поднять существующий вход и продолжить ту же запись. */
  onNeedAuth: (retry: () => void) => void;
  /** Переключатель разделов гибридной студии — под шапкой, над лентой недели. */
  segment?: ReactNode;
  /** Занятие из QR-кода студии: открыть его день и сам лист брони. */
  focusLesson?: { id: number; date?: string };
  /** Групповая услуга из QR-кода студии: расписание сразу отфильтровано по ней. */
  focusServiceId?: number;
  /** Тренер из QR-кода студии: расписание сразу отфильтровано по нему. */
  focusStaffId?: number;
}

/**
 * Расписание групповых занятий по дням (booking_mode `event`, и групповой
 * раздел `hybrid`). Индивидуальная запись живёт отдельно — pages/booking.
 */
export default function EventSchedule({ catalog, onBuySubscription, onNeedAuth, segment, focusLesson, focusServiceId, focusStaffId }: EventScheduleProps) {
  const branches = catalog?.branches ?? [];
  const isMultiStudio = branches.length > 1;
  const rules = catalog?.rules ?? null;

  // Последний день открытого расписания — «Запись открыта на N дней» из
  // настроек студии. Ленту недель дальше не листаем.
  const maxDate = useMemo(() => {
    if (!rules) return undefined;
    const limit = new Date();
    limit.setDate(limit.getDate() + rules.booking_window_days);
    return limit;
  }, [rules]);

  // День из ссылки — начальное состояние, а не эффект: иначе экран сначала
  // покажет сегодня, сходит за ним в сеть и только потом переедет на нужный
  // день, то есть два запроса и видимый прыжок вместо открытия.
  // Локальная полночь (`T00:00:00`), а не голый `YYYY-MM-DD`: последний Date
  // читает как UTC, и вечером восточнее Гринвича день съезжает назад.
  const [date, setDate] = useState(() =>
    focusLesson?.date ? new Date(`${focusLesson.date}T00:00:00`) : new Date(),
  );
  const day = isoDate(date);
  /* Последний полученный день. Вместе со списком хранится, первый ли он за
     жизнь экрана: лесенка появления положена только ему. Листая неделю, человек
     смотрит расписание, а не анимацию — повторный въезд карточек на каждый день
     читается как задержка, а не как оформление. */
  const [loaded, setLoaded] = useState<{
    day: string;
    lessons: LessonResponse[];
    first: boolean;
  } | null>(null);
  /* День, ответ по которому не пришёл вовремя. Хранится днём, а не флагом:
     смена даты обнуляет его сама, без второго setState. */
  const [slowDay, setSlowDay] = useState<string | null>(null);
  // Раздел остаётся смонтированным при переключении вкладок, поэтому о записях,
  // сделанных на главной, он узнаёт из общей версии (см. lib/revision.ts).
  const lessonsVersion = useLessonsVersion();

  // Пустой выбор студий — «Все»: с него расписание и открывается.
  const [filters, setFilters] = useState<Filters>({
    studioIds: ALL_BRANCHES,
    service: null,
    teacher: null,
  });

  // Услуга из QR-кода студии: человек пришёл с плаката конкретного направления
  // и должен увидеть его, а не всё расписание. Эффектом, а не начальным
  // состоянием: раздел выбирается по механике услуги, а её называет каталог,
  // который приезжает позже первого кадра. Один раз — дальше фильтр его.
  const focusedService = useRef(false);
  useEffect(() => {
    if (focusServiceId == null || focusedService.current) return;
    focusedService.current = true;
    setFilters((current) => ({ ...current, service: focusServiceId }));
  }, [focusServiceId]);

  // Тренер из QR-кода — тем же порядком. Фильтр по НОМЕРУ, поэтому ждать
  // каталог незачем: имя нужно только чипу, и оно приедет к нему само.
  const focusedStaff = useRef(false);
  useEffect(() => {
    if (focusStaffId == null || focusedStaff.current) return;
    focusedStaff.current = true;
    setFilters((current) => ({ ...current, teacher: focusStaffId }));
  }, [focusStaffId]);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  // Каталог мог перечитаться без одного из филиалов — выбранным он не считается.
  const studioIds = knownBranches(filters.studioIds, branches.map((branch) => branch.id));
  const studiosKey = branchKey(studioIds);

  /* Что на экране: день из кэша — сразу, в тот же кадр; иначе последний
     загруженный список, пока идёт запрос. Скелет остаётся ровно для двух
     случаев — первый заход, когда показывать нечего, и по-настоящему долгий
     ответ. Промежуточного «занятия → заглушки → занятия» больше нет. */
  const cached = dayCache.get(`${day}|${studiosKey}`);
  // useMemo ради постоянной ссылки: пустой список иначе создавался бы заново
  // каждый рендер и обнулял три useMemo ниже (фильтры и видимый список).
  const dayClasses = useMemo(() => cached ?? loaded?.lessons ?? [], [cached, loaded]);
  const isLoading = cached === undefined && (loaded === null || slowDay === day);
  const entrance = loaded?.first ?? true;

  const { vibrateLight } = useTelegram();
  const { t, i18n } = useTranslation();

  // Запись и отмена — общие с главной (useLessonBooking): один сценарий, две
  // страницы. Здесь остаётся только то, что у расписания своё, — список дня.
  const booking = useLessonBooking({
    messages: {
      bookError: t('schedule.booking_error'),
      cancelError: t('schedule.cancel_error'),
      cancelSuccess: t('schedule.cancel_success'),
    },
    onNeedAuth,
  });

  // Занятие из QR-кода студии: поднять его лист брони, как только день пришёл.
  // Ровно один раз за жизнь экрана — иначе лист открывался бы заново после
  // каждого закрытия и после каждого фонового обновления списка.
  // Занятия в дне нет (отменили, уже прошло) — остаётся открытый нужный день:
  // ошибка «занятие не найдено» человеку, пришедшему с плаката, ничего не даёт.
  const focused = useRef(false);
  useEffect(() => {
    if (!focusLesson || focused.current) return;
    const lesson = dayClasses.find((item) => item.id === focusLesson.id);
    if (!lesson) return;
    focused.current = true;
    booking.openModal(lesson);
  }, [focusLesson, dayClasses, booking]);

  useEffect(() => {
    let cancelled = false;
    const wanted = isoDate(date);
    // Выбор филиалов участвует в КЛЮЧЕ кэша: без него список одного филиала
    // показался бы как список другого при переключении (HB-19 п.2).
    const key = `${wanted}|${studiosKey}`;

    // Первая же бронь обесценивает все дни разом — занятые места есть в каждой
    // карточке. Поэтому кэш сбрасывается целиком, а не по одному дню.
    resetDayCache(lessonsVersion);

    // Запрос уходит и по известному дню: место могли занять с другого
    // устройства, и список обновится молча, прямо под рукой. Скелет включается
    // только если ответа нет дольше SKELETON_DELAY_MS — на быстром ответе он не
    // появится вовсе.
    const timer = window.setTimeout(() => {
      if (!cancelled) setSlowDay(wanted);
    }, SKELETON_DELAY_MS);

    getLessonsByDate(wanted, { branch_id: studiosKey ? branchesOfKey(studiosKey) : null })
      .then((data) => {
        dayCache.set(key, data);
        if (!cancelled) setLoaded((prev) => ({ day: wanted, lessons: data, first: prev === null }));
      })
      .catch((error) => {
        console.error('Помилка завантаження розкладу:', error);
        if (!cancelled) setLoaded((prev) => ({ day: wanted, lessons: [], first: prev === null }));
      })
      .finally(() => {
        window.clearTimeout(timer);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [date, studiosKey, lessonsVersion]);

  // Варианты фильтров собираются из самого дня: показывать «Олену», которой
  // сегодня нет в расписании, — это выбор, ведущий в пустоту.
  // HB-19: услуга в фильтре — числовой ID, подпись отдельно. Два одноимённых
  // направления перестают быть одним пунктом списка.
  const services = useMemo(() => {
    const seen = new Map<number, string>();
    dayClasses.forEach((lesson) => {
      if (lesson.service_id != null && !seen.has(lesson.service_id)) {
        seen.set(lesson.service_id, lesson.name);
      }
    });
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [dayClasses]);
  const teachers = useMemo(() => {
    const seen = new Map<number, string>();
    dayClasses.forEach((lesson) => {
      if (lesson.teacher_id != null && lesson.teacher && !seen.has(lesson.teacher_id)) {
        seen.set(lesson.teacher_id, lesson.teacher);
      }
    });
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [dayClasses]);

  const visible = useMemo(
    () =>
      dayClasses.filter(
        (lesson) =>
          (!filters.service || lesson.service_id === filters.service) &&
          (!filters.teacher || lesson.teacher_id === filters.teacher),
      ),
    [dayClasses, filters],
  );

  /**
   * Подпись услуги в чипе фильтра. В самом фильтре лежит ID (HB-19: два
   * одноимённых направления — разные пункты), и печатать его человеку нельзя.
   * Имя ищем сначала в услугах дня, потом в каталоге студии: услуга из ссылки
   * может не идти сегодня вовсе, и чип обязан назвать её всё равно.
   */
  const serviceLabel = (id: number): string => {
    const name = services.find((item) => item.id === id)?.name
      ?? catalog?.services.find((item) => item.id === id)?.name;
    return name ? t(`lesson.name.${name}`, { defaultValue: name }) : String(id);
  };

  /** То же для тренера: занятий этого дня может не быть вовсе (человек пришёл
   *  по его QR-коду в выходной), и тогда имя называет справочник студии. */
  const teacherLabel = (id: number): string =>
    teachers.find((item) => item.id === id)?.name
    ?? catalog?.staff.find((item) => item.id === id)?.name
    ?? String(id);

  const activeCount = (filters.service ? 1 : 0) + (filters.teacher ? 1 : 0);
  const studioLabel = studioIds.length === 0
    ? t('schedule.all_studios')
    : branches.filter((s) => studioIds.includes(s.id)).map((s) => s.name).join(', ');
  // Филиал на карточке — когда из фильтра не ясно, где проходит занятие.
  const showPlace = isMultiStudio && studioIds.length !== 1;

  const isToday = isSameDay(date, new Date());

  return (
    <>
      <ScreenHeader
        kicker={date.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })}
        title={t('schedule.title')}
        action={
          !isToday ? (
            <motion.button
              type="button"
              onClick={() => {
                setDate(new Date());
                vibrateLight();
              }}
              // Место под кнопку в шапке зарезервировано (ScreenHeader), так что
              // появиться она может мягко: без сдвига соседей это уже не «скачок».
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 500, damping: 32 }}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-card py-2 pl-2.5 pr-3.5 shadow-soft"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <polyline points="11 17 6 12 11 7" />
                <path d="M6 12h8a4 4 0 010 8h-1" />
              </svg>
              <span className="text-[11px] font-extrabold tracking-[-0.01em] text-brand">
                {t('schedule.today')}
              </span>
            </motion.button>
          ) : undefined
        }
      />

      {segment}

      {/* Лента недели не тянется во всю колонку: семь клеток на 1160px стали бы
          широкими прямоугольниками, а дата — это число, а не панель. Мера у
          неё та же, что у уведомления ниже, — два разных обреза подряд читаются
          как сбитая вёрстка. */}
      <div className="pt-6 dt:pt-10">
        <WeekRail value={date} onChange={setDate} maxDate={maxDate} />
      </div>

      {rules && !rules.booking_active && <BookingClosedNotice />}

      {/* Панель фильтров ростом в одну строку: на телефоне вертикаль дороже
          удобства, поэтому выбранное показано чипами, а сам выбор — в листе. */}
      <div className="flex gap-2 overflow-x-auto px-5 pt-5 dt:flex-wrap dt:gap-2.5 dt:overflow-visible dt:pt-8">
        <motion.button
          type="button"
          onClick={() => {
            setIsFilterOpen(true);
            vibrateLight();
          }}
          whileTap={{ scale: 0.94 }}
          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full pl-3 pr-3.5 transition-shadow duration-300 dt:h-10 dt:pl-3.5 dt:pr-4 dt:hover:shadow-lift ${
            activeCount > 0 ? 'bg-brand text-brand-foreground shadow-brand' : 'bg-card shadow-soft'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke={activeCount > 0 ? 'var(--v-brand-foreground)' : 'var(--v-brand)'}
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
          >
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="7" y1="12" x2="17" y2="12" />
            <line x1="10" y1="18" x2="14" y2="18" />
          </svg>
          <span className="whitespace-nowrap text-[12px] font-extrabold tracking-[-0.01em]">
            {t('schedule.filters')}
            {activeCount > 0 ? ` · ${activeCount}` : ''}
          </span>
        </motion.button>

        {isMultiStudio && (
          <span className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-card pl-3 pr-3.5 shadow-soft dt:h-10 dt:pl-3.5 dt:pr-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-muted-foreground)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span className="max-w-[220px] truncate whitespace-nowrap text-[12px] font-bold text-foreground">
              {studioLabel}
            </span>
          </span>
        )}

        {(['service', 'teacher'] as const).map((key) => {
          const value = filters[key];
          if (!value) return null;

          return (
            <motion.button
              key={key}
              type="button"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => setFilters({ ...filters, [key]: null })}
              whileTap={{ scale: 0.94 }}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-card pl-3.5 pr-2.5 shadow-soft transition-shadow duration-300 dt:h-10 dt:pl-4 dt:pr-3 dt:hover:shadow-lift"
            >
              <span className="whitespace-nowrap text-[12px] font-bold text-foreground">
                {key === 'service' ? serviceLabel(value) : teacherLabel(value)}
              </span>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-muted-foreground)" strokeWidth="2.6" strokeLinecap="round" className="h-3 w-3">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </motion.button>
          );
        })}
      </div>

      {/* Расписание дня — один столбец сверху вниз. Две колонки на десктопе
          заставляли читать список зигзагом: время идёт по возрастанию, а глаз
          обязан прыгать вправо и обратно, чтобы не потерять порядок. */}
      <div className="flex flex-col gap-3 px-5 pt-5 dt:gap-4 dt:pt-10">
        {isLoading ? (
          <div>
            <ListSkeleton rows={4} flush />
          </div>
        ) : visible.length > 0 ? (
          visible.map((cl, i) => (
            <LessonCard
              key={cl.id ?? i}
              lesson={cl}
              index={i}
              entrance={entrance}
              place={showPlace ? branches.find((s) => s.id === cl.branch_id)?.name : undefined}
              title={cl.name ? t(`lesson.name.${cl.name}`, { defaultValue: cl.name }) : ''}
              bookedLabel={t('schedule.booked')}
              almostFullLabel={t('schedule.almost_full')}
              availableLabel={t('schedule.available')}
              onClick={() => booking.openModal(cl)}
            />
          ))
        ) : (
          <div>
            <EmptyState
              title={activeCount > 0 ? t('schedule.no_matches') : t('schedule.no_classes')}
              hint={activeCount > 0 ? t('schedule.no_matches_hint') : undefined}
            />
          </div>
        )}
      </div>

      <FilterSheet
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        value={{ ...filters, studioIds }}
        onChange={(next) =>
          // Смена филиалов — смена контекста: услуга и специалист прошлого
          // выбора могут перестать существовать, и оставлять их выбранными
          // значит показывать пустой список без объяснения (HB-19 п.2).
          setFilters(
            branchKey(next.studioIds) !== studiosKey
              ? { ...next, service: null, teacher: null }
              : next,
          )
        }
        studios={branches}
        isMultiStudio={isMultiStudio}
        services={services}
        teachers={teachers}
        resultCount={visible.length}
      />

      <BookingModal
        isOpen={booking.isModalOpen}
        onClose={booking.closeModal}
        selectedSpot={booking.selectedSpot}
        onSpotSelect={booking.setSelectedSpot}
        isProcessing={booking.isProcessing}
        onPay={booking.pay}
        onCancel={booking.cancelBooking}
        lesson={booking.activeLesson}
        allowRepeat={Boolean(rules?.repeat_booking_allowed)}
      />

      <PhoneSheet
        isOpen={booking.needsPhone}
        onClose={booking.closePhone}
        onSaved={booking.retryAfterPhone}
        layer={2}
      />

      <SubscriptionSheet
        isOpen={booking.needsSubscription !== null}
        onClose={booking.closeSubscription}
        message={booking.needsSubscription}
        onBuy={() => { booking.closeSubscription(); onBuySubscription(); }}
      />

      <SuccessModal
        isOpen={booking.isSuccessOpen}
        onClose={booking.closeSuccess}
        lesson={booking.activeLesson}
        awaitingConfirmation={Boolean(rules?.confirmation_required)}
        layer={1}
      />

      <CoffeeModal
        isOpen={booking.isCoffeeOpen}
        onClose={booking.closeCoffee}
        lessonId={booking.activeLesson?.id ?? null}
        coffee={booking.coffee}
        onJoined={bumpLessons}
        layer={1}
      />
    </>
  );
}
