import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import BookingModal from '../components/modals/BookingModal';
import PhoneSheet from '../components/modals/PhoneSheet';
import SubscriptionSheet from '../components/modals/SubscriptionSheet';
import SuccessModal from '../components/modals/SuccessModal';
import CoffeeModal from '../components/modals/CoffeeModal';
import WeekRail from '../components/schedule/WeekRail';
import LessonCard from '../components/schedule/LessonCard';
import FilterSheet, { type Filters } from '../components/schedule/FilterSheet';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { ListSkeleton } from '../components/ui/ListSkeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { getLessonsByDate, type LessonResponse } from '../api/lessons';
import { useTelegram } from '../hooks/useTelegram';
import { useLessonBooking } from '../hooks/useLessonBooking';
import { bumpLessons, useLessonsVersion } from '../lib/revision';
import type { StudioCatalog } from '../api/studio';

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

/** Задержка перед скелетом. Ответ приходит быстрее — и он не появится вовсе. */
const SKELETON_DELAY_MS = 220;

interface SheduleProps {
  catalog: StudioCatalog | null;
  /** Отказ 402 ведёт в покупку абонемента — она живёт во вкладке профиля. */
  onBuySubscription: () => void;
  /** Бронь гостя: поднять существующий вход и продолжить ту же запись. */
  onNeedAuth: (retry: () => void) => void;
}

export default function Shedule({ catalog, onBuySubscription, onNeedAuth }: SheduleProps) {
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

  const [date, setDate] = useState(() => new Date());
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

  const [filters, setFilters] = useState<Filters>({
    studioId: branches[0]?.id ?? 0,
    service: null,
    teacher: null,
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  /* Что на экране: день из кэша — сразу, в тот же кадр; иначе последний
     загруженный список, пока идёт запрос. Скелет остаётся ровно для двух
     случаев — первый заход, когда показывать нечего, и по-настоящему долгий
     ответ. Промежуточного «занятия → заглушки → занятия» больше нет. */
  const cached = dayCache.get(day);
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

  useEffect(() => {
    let cancelled = false;
    const wanted = isoDate(date);

    // Первая же бронь обесценивает все дни разом — занятые места есть в каждой
    // карточке. Поэтому кэш сбрасывается целиком, а не по одному дню.
    if (cachedVersion !== lessonsVersion) {
      dayCache.clear();
      cachedVersion = lessonsVersion;
    }

    // Запрос уходит и по известному дню: место могли занять с другого
    // устройства, и список обновится молча, прямо под рукой. Скелет включается
    // только если ответа нет дольше SKELETON_DELAY_MS — на быстром ответе он не
    // появится вовсе.
    const timer = window.setTimeout(() => {
      if (!cancelled) setSlowDay(wanted);
    }, SKELETON_DELAY_MS);

    getLessonsByDate(wanted)
      .then((data) => {
        dayCache.set(wanted, data);
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
  }, [date, lessonsVersion]);

  // Варианты фильтров собираются из самого дня: показывать «Олену», которой
  // сегодня нет в расписании, — это выбор, ведущий в пустоту.
  const services = useMemo(
    () => [...new Set(dayClasses.map((lesson) => lesson.name).filter(Boolean))],
    [dayClasses],
  );
  const teachers = useMemo(
    () => [...new Set(dayClasses.map((lesson) => lesson.teacher).filter(Boolean))],
    [dayClasses],
  );

  const visible = useMemo(
    () =>
      dayClasses.filter(
        (lesson) =>
          (!filters.service || lesson.name === filters.service) &&
          (!filters.teacher || lesson.teacher === filters.teacher),
      ),
    [dayClasses, filters],
  );

  const activeCount = (filters.service ? 1 : 0) + (filters.teacher ? 1 : 0);
  const studioName = branches.find((s) => s.id === filters.studioId)?.name ?? '';

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

      {/* Лента недели не тянется во всю колонку: семь клеток на 1160px стали бы
          широкими прямоугольниками, а дата — это число, а не панель. Мера у
          неё та же, что у уведомления ниже, — два разных обреза подряд читаются
          как сбитая вёрстка. */}
      <div className="pt-6 dt:pt-10">
        <WeekRail value={date} onChange={setDate} maxDate={maxDate} />
      </div>

      {/* Онлайн-запись выключена студией: расписание остаётся видимым (клиенту
          надо знать, когда занятия), но записаться нельзя — и об этом честно
          говорим один раз сверху, а не отказом на каждой карточке. */}
      {rules && !rules.booking_active && (
        <div className="mx-5 mt-5 rounded-[18px] bg-card px-4 py-3.5 shadow-soft dt:rounded-[20px] dt:px-5 dt:py-4">
          <div className="text-[13px] font-extrabold tracking-[-0.015em] text-foreground">
            {t('schedule.booking_closed')}
          </div>
          <div className="mt-1 text-[12px] font-medium leading-relaxed text-muted-foreground">
            {t('schedule.booking_closed_hint')}
          </div>
        </div>
      )}

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
            <span className="whitespace-nowrap text-[12px] font-bold text-foreground">
              {studioName}
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
                {key === 'service' ? t(`lesson.name.${value}`, { defaultValue: value }) : value}
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
        value={filters}
        onChange={setFilters}
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
