import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import BookingModal from '../components/modals/BookingModal';
import SuccessModal from '../components/modals/SuccessModal';
import WeekRail from '../components/schedule/WeekRail';
import LessonCard from '../components/schedule/LessonCard';
import FilterSheet, { type Filters } from '../components/schedule/FilterSheet';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { ListSkeleton } from '../components/ui/ListSkeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { getLessonsByDate, type LessonResponse } from '../api/lessons';
import { useTelegram } from '../hooks/useTelegram';
import { bookLesson, cancelLesson } from '../api/user';
import { spawnPetals } from '../lib/petals';
import { notify } from '../lib/notify';
import type { StudioCatalog } from '../api/studio';

/** `Date` → `YYYY-MM-DD` без ухода в UTC (иначе вечером день съезжает назад). */
const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

const isSameDay = (a: Date, b: Date) =>
  a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

interface SheduleProps {
  catalog: StudioCatalog | null;
}

export default function Shedule({ catalog }: SheduleProps) {
  const branches = catalog?.branches ?? [];
  const isMultiStudio = branches.length > 1;

  const [date, setDate] = useState(() => new Date());
  const [dayClasses, setDayClasses] = useState<LessonResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const [filters, setFilters] = useState<Filters>({
    studioId: branches[0]?.id ?? 0,
    service: null,
    teacher: null,
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [activeLesson, setActiveLesson] = useState<LessonResponse | null>(null);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const { tg, vibrateMedium, vibrateLight } = useTelegram();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    let cancelled = false;

    const fetchClasses = async () => {
      setIsLoading(true);
      try {
        const data = await getLessonsByDate(isoDate(date));
        if (!cancelled) setDayClasses(data);
      } catch (error) {
        console.error('Помилка завантаження розкладу:', error);
        if (!cancelled) setDayClasses([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchClasses();
    return () => {
      cancelled = true;
    };
  }, [date, refreshTick]);

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

  const openModal = (lesson: LessonResponse | null) => {
    setSelectedSpot(null);
    setActiveLesson(lesson);
    setIsModalOpen(true);
    vibrateMedium();
  };

  const closeModal = () => setIsModalOpen(false);

  const closeSuccess = () => {
    if (tg) tg.close();
    else setIsSuccessOpen(false);
  };

  const pay = async () => {
    if (!activeLesson || !selectedSpot) return;

    setIsProcessing(true);

    try {
      await bookLesson({ lesson_id: activeLesson.id, spot_number: selectedSpot });

      setRefreshTick((tick) => tick + 1);
      setIsProcessing(false);
      closeModal();
      setIsSuccessOpen(true);
      spawnPetals();

      if (tg) tg.HapticFeedback.notificationOccurred('success');
    } catch (error) {
      setIsProcessing(false);
      notify(error instanceof Error ? error.message : t('schedule.booking_error'));
      if (tg) tg.HapticFeedback.notificationOccurred('error');
    }
  };

  const cancelBooking = async () => {
    if (!activeLesson) return;

    setIsProcessing(true);

    try {
      await cancelLesson(activeLesson.id);

      setRefreshTick((tick) => tick + 1);
      setIsProcessing(false);
      closeModal();
      notify(t('schedule.cancel_success'));
      if (tg) tg.HapticFeedback.notificationOccurred('success');
    } catch (error) {
      setIsProcessing(false);
      notify(error instanceof Error ? error.message : t('schedule.cancel_error'));
      if (tg) tg.HapticFeedback.notificationOccurred('error');
    }
  };

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

      <div className="pt-6">
        <WeekRail value={date} onChange={setDate} />
      </div>

      {/* Панель фильтров ростом в одну строку: на телефоне вертикаль дороже
          удобства, поэтому выбранное показано чипами, а сам выбор — в листе. */}
      <div className="flex gap-2 overflow-x-auto px-5 pt-5">
        <motion.button
          type="button"
          onClick={() => {
            setIsFilterOpen(true);
            vibrateLight();
          }}
          whileTap={{ scale: 0.94 }}
          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full pl-3 pr-3.5 ${
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
          <span className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-card pl-3 pr-3.5 shadow-soft">
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
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-card pl-3.5 pr-2.5 shadow-soft"
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

      <div className="flex flex-col gap-3 px-5 pt-5">
        {isLoading ? (
          <ListSkeleton rows={4} flush />
        ) : visible.length > 0 ? (
          visible.map((cl, i) => (
            <LessonCard
              key={cl.id ?? i}
              lesson={cl}
              index={i}
              title={cl.name ? t(`lesson.name.${cl.name}`, { defaultValue: cl.name }) : ''}
              bookedLabel={t('schedule.booked')}
              almostFullLabel={t('schedule.almost_full')}
              availableLabel={t('schedule.available')}
              onClick={() => openModal(cl)}
            />
          ))
        ) : (
          <EmptyState
            title={activeCount > 0 ? t('schedule.no_matches') : t('schedule.no_classes')}
            hint={activeCount > 0 ? t('schedule.no_matches_hint') : undefined}
          />
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
        isOpen={isModalOpen}
        onClose={closeModal}
        selectedSpot={selectedSpot}
        onSpotSelect={setSelectedSpot}
        isProcessing={isProcessing}
        onPay={pay}
        onCancel={cancelBooking}
        lesson={activeLesson}
      />

      <SuccessModal isOpen={isSuccessOpen} onClose={closeSuccess} lesson={activeLesson} layer={1} />
    </>
  );
}
