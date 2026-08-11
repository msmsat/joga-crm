import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import UpcomingCard from '../components/mylessons/UpcomingCard';
import CoffeeStrip from '../components/mylessons/CoffeeStrip';
import PastCard from '../components/mylessons/PastCard';
import PeriodBar, { type PeriodMode } from '../components/mylessons/PeriodBar';
import MyLessonModal from '../components/modals/MyLessonModal';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { SectionLabel } from '../components/ui/SectionLabel';
import { ListSkeleton } from '../components/ui/ListSkeleton';
import { EmptyState } from '../components/ui/EmptyState';
import {
  getMyLessons,
  type CoffeeState,
  type UpcomingLessonResponse,
  type PastLessonResponse,
} from '../api/lessons';
import { cancelLesson, rateLesson } from '../api/user';
import { useTelegram } from '../hooks/useTelegram';
import { notify } from '../lib/notify';

type MyLesson = UpcomingLessonResponse | PastLessonResponse;

export default function MyLessons() {
  const { t, i18n } = useTranslation();
  const { tg, vibrateLight, vibrateMedium } = useTelegram();

  const [upcoming, setUpcoming] = useState<UpcomingLessonResponse[]>([]);
  const [past, setPast] = useState<PastLessonResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Открытое занятие. Держим объектом, а не id: после отмены оно исчезает из
  // списков, и лист домигивал бы пустой шапкой, пока уезжает.
  const [activeLesson, setActiveLesson] = useState<MyLesson | null>(null);
  const [isPastLesson, setIsPastLesson] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [mode, setMode] = useState<PeriodMode>('month');
  const [anchor, setAnchor] = useState(() => new Date());

  const [countdowns, setCountdowns] = useState<{ [key: number]: string }>({});
  const [ratings, setRatings] = useState<{ [key: number]: number }>({});
  const [bouncing, setBouncing] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    const fetchLessons = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await getMyLessons();
        setUpcoming(data.upcoming);
        setPast(data.past);

        const initialRatings: { [key: number]: number } = {};
        data.past.forEach((lesson) => {
          if (lesson.rating) initialRatings[lesson.id] = lesson.rating;
        });
        setRatings(initialRatings);
      } catch (err) {
        console.error('Помилка завантаження моїх занять:', err);
        setError(err instanceof Error ? err.message : t('mylessons.load_error'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchLessons();
  }, [t]);

  useEffect(() => {
    if (upcoming.length === 0) return;

    const updateCountdowns = () => {
      const now = Date.now();
      const next: { [key: number]: string } = {};

      upcoming.forEach((lesson) => {
        const diff = new Date(lesson.start_time).getTime() - now;
        next[lesson.id] =
          diff > 0
            ? t('mylessons.remaining', {
                hours: Math.floor(diff / 3600000),
                minutes: Math.floor((diff % 3600000) / 60000),
              })
            : t('mylessons.lesson_started');
      });
      setCountdowns(next);
    };

    updateCountdowns();
    const interval = setInterval(updateCountdowns, 60000);
    return () => clearInterval(interval);
  }, [upcoming, t]);

  // Период считается на клиенте: /lessons/my отдаёт всю историю разом и
  // диапазона не принимает. Появится — фильтр переедет в запрос.
  const inPeriod = useMemo(() => {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();

    return (iso: string) => {
      const date = new Date(iso);
      if (date.getFullYear() !== year) return false;
      return mode === 'year' || date.getMonth() === month;
    };
  }, [anchor, mode]);

  const periodPast = useMemo(
    () => past.filter((lesson) => inPeriod(lesson.start_time)),
    [past, inPeriod],
  );
  const periodUpcoming = useMemo(
    () => upcoming.filter((lesson) => inPeriod(lesson.start_time)),
    [upcoming, inPeriod],
  );

  // Любимое направление периода — то, на которое клиент ходил чаще всего.
  const favourite = useMemo(() => {
    const counts = new Map<string, number>();
    periodPast.forEach((lesson) => counts.set(lesson.name, (counts.get(lesson.name) ?? 0) + 1));

    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return ranked.length > 0 ? ranked[0][0] : null;
  }, [periodPast]);

  const shiftPeriod = (direction: number) => {
    const next = new Date(anchor);
    if (mode === 'month') next.setMonth(next.getMonth() + direction);
    else next.setFullYear(next.getFullYear() + direction);
    setAnchor(next);
    vibrateLight();
  };

  const openLesson = (lesson: MyLesson, past: boolean) => {
    setActiveLesson(lesson);
    setIsPastLesson(past);
    setIsModalOpen(true);
    vibrateMedium();
  };

  /** Ответ сервера про кофе — сразу в оба места, где он виден: карточка списка
   *  и открытый лист. Иначе одно из них показывало бы состояние до нажатия. */
  const applyCoffee = (lessonId: number, state: CoffeeState) => {
    setUpcoming((list) =>
      list.map((item) => (item.id === lessonId ? { ...item, coffee: state } : item)),
    );
    setActiveLesson((current) =>
      current && current.id === lessonId ? { ...current, coffee: state } : current,
    );
  };

  /** Отмена записи. Занятие просто убираем из списка: отменённых броней
   *  /lessons/my не отдаёт, так что перезапрос вернул бы ровно это же. */
  const cancelBooking = async () => {
    if (!activeLesson) return;

    setIsProcessing(true);
    try {
      await cancelLesson(activeLesson.id);
      setUpcoming((list) => list.filter((item) => item.id !== activeLesson.id));
      setIsModalOpen(false);
      notify(t('schedule.cancel_success'));
      if (tg) tg.HapticFeedback.notificationOccurred('success');
    } catch (err) {
      // Правила отмены (за сколько часов ещё можно) живут на сервере — его
      // текстом и объясняем отказ, вместо своей догадки.
      notify(err instanceof Error ? err.message : t('schedule.cancel_error'));
      if (tg) tg.HapticFeedback.notificationOccurred('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const rateClass = async (classId: number, rating: number) => {
    setRatings({ ...ratings, [classId]: rating });
    vibrateLight();

    for (let i = 1; i <= rating; i++) {
      setTimeout(() => {
        setBouncing((prev) => ({ ...prev, [`${classId}-${i}`]: true }));
        setTimeout(() => setBouncing((prev) => ({ ...prev, [`${classId}-${i}`]: false })), 500);
      }, i * 60);
    }

    try {
      await rateLesson(classId, rating);
    } catch (error) {
      console.error('Не вдалося зберегти оцінку:', error);
      notify(error instanceof Error ? error.message : t('mylessons.save_review_error'));
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' });

  const translateName = (name?: string) =>
    name ? t(`lesson.name.${name}`, { defaultValue: name }) : '';

  const stats = [
    { label: t('mylessons.stat_visited'), value: String(periodPast.length) },
    { label: t('mylessons.stat_ahead'), value: String(periodUpcoming.length) },
    { label: t('mylessons.stat_total'), value: String(past.length) },
  ];

  return (
    <>
      <ScreenHeader title={t('mylessons.title')} />

      {/* Полоса управления периодом и сводка — друг под другом на всех
          ширинах: один столбец сверху вниз читается без переучивания. */}
      <>
        <div className="pt-6 dt:pt-10">
          <PeriodBar mode={mode} onModeChange={setMode} anchor={anchor} onShift={shiftPeriod} />
        </div>

        {/* Сводка периода: три числа в ряд — сколько прожито, сколько впереди и
            сколько всего. Ради «всего» клиент и возвращается на этот экран. */}
        <div className="grid grid-cols-3 gap-2 px-5 pt-4 dt:gap-3">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-[18px] bg-card px-3 py-3.5 text-center shadow-soft dt:rounded-[20px] dt:px-4 dt:py-5"
            >
              <div className="text-[22px] font-extrabold leading-none tabular-nums tracking-[-0.04em] text-foreground dt:text-[30px]">
                {stat.value}
              </div>
              <div className="mt-1.5 text-[9.5px] font-bold uppercase leading-tight tracking-[0.1em] text-muted-foreground dt:mt-2.5 dt:text-[10px] dt:tracking-[0.16em]">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </>

      {favourite && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="mx-5 mt-2 flex items-center gap-2.5 rounded-[18px] bg-brand/10 px-4 py-3 dt:mt-5 dt:w-fit"
        >
          <svg viewBox="0 0 24 24" fill="var(--v-brand)" className="h-3.5 w-3.5 shrink-0">
            <path d="M12 21c-4-2.5-8-5.6-8-11a5 5 0 018-3.5A5 5 0 0120 10c0 5.4-4 8.5-8 11z" />
          </svg>
          <span className="text-[12.5px] font-bold text-foreground">
            {t('mylessons.favourite', { name: translateName(favourite) })}
          </span>
        </motion.div>
      )}

      {isLoading ? (
        <div className="pt-8">
          <ListSkeleton rows={3} />
        </div>
      ) : error ? (
        <EmptyState
          title={t('mylessons.load_error')}
          hint={error}
          icon={
            <>
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="13" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </>
          }
        />
      ) : periodUpcoming.length === 0 && periodPast.length === 0 ? (
        <EmptyState
          title={t('mylessons.no_lessons_period')}
          hint={t('mylessons.no_lessons_period_hint')}
          icon={
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          }
        />
      ) : (
        <>
          {periodUpcoming.length > 0 && (
            <>
              <SectionLabel trailing={`${periodUpcoming.length}`}>
                {t('mylessons.status.upcoming')}
              </SectionLabel>
              <div className="flex flex-col gap-3 px-5 dt:gap-4">
                {periodUpcoming.map((cls, i) => (
                  <UpcomingCard
                    key={`upcoming-${cls.id}`}
                    index={i}
                    title={translateName(cls.name)}
                    statusLabel={
                      cls.status === 'pending'
                        ? t('mylessons.awaiting_confirmation')
                        : t('mylessons.status.upcoming')
                    }
                    statusTone={cls.status === 'pending' ? 'brand' : 'neutral'}
                    meta={`${formatDate(cls.start_time)}, ${cls.time} · ${cls.teacher}`}
                    matLabel={t('mylessons.mat_label', { spot: cls.spot_number })}
                    countdown={countdowns[cls.id] || t('mylessons.counting_time')}
                    onOpen={() => openLesson(cls, false)}
                    footer={
                      <CoffeeStrip
                        lessonId={cls.id}
                        coffee={cls.coffee}
                        onChange={(state) => applyCoffee(cls.id, state)}
                      />
                    }
                  />
                ))}
              </div>
            </>
          )}

          {periodPast.length > 0 && (
            <>
              <SectionLabel trailing={`${periodPast.length}`}>
                {t('mylessons.status.past')}
              </SectionLabel>
              <div className="flex flex-col gap-3 px-5 dt:gap-4">
                {periodPast.map((cls, i) => (
                  <PastCard
                    key={`past-${cls.id}`}
                    index={i}
                    lessonId={cls.id}
                    title={translateName(cls.name)}
                    statusLabel={t('mylessons.status.past')}
                    meta={`${formatDate(cls.start_time)}, ${cls.time} · ${cls.teacher}`}
                    ratingLabel={t('mylessons.your_rating')}
                    rating={ratings[cls.id] || 0}
                    bouncing={bouncing}
                    onRate={(star) => rateClass(cls.id, star)}
                    onOpen={() => openLesson(cls, true)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <MyLessonModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        lesson={activeLesson}
        isPast={isPastLesson}
        title={translateName(activeLesson?.name)}
        dateLabel={activeLesson ? formatDate(activeLesson.start_time) : ''}
        countdown={activeLesson ? countdowns[activeLesson.id] : undefined}
        rating={activeLesson ? ratings[activeLesson.id] || 0 : 0}
        bouncing={bouncing}
        onRate={activeLesson ? (star) => rateClass(activeLesson.id, star) : undefined}
        isProcessing={isProcessing}
        onCancel={cancelBooking}
        onCoffeeChange={
          activeLesson ? (state) => applyCoffee(activeLesson.id, state) : undefined
        }
      />
    </>
  );
}
