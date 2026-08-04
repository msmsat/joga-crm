import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../ui/Sheet';
import WeekRail from './WeekRail';
import LessonCard from './LessonCard';
import { ListSkeleton } from '../ui/ListSkeleton';
import { EmptyState } from '../ui/EmptyState';
import { getLessonsByDate, type LessonResponse } from '../../api/lessons';
import type { Studio } from '../../api/studio';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Ключ услуги/направления — он же `lesson.name` */
  serviceId: string | null;
  /** Студия, в контексте которой смотрим расписание (null — студия одна) */
  studio: Studio | null;
  onLessonPick: (lesson: LessonResponse) => void;
  /** Меняется после брони/отмены — список перечитывается. */
  refreshKey?: number;
  layer?: number;
};

/** `Date` → `YYYY-MM-DD` без ухода в UTC (иначе вечером день съезжает назад). */
const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

/**
 * Расписание одной услуги: тот же вид, что и на общем расписании, но сужено до
 * выбранной услуги. Клиент, который пришёл «на пилатес», не должен глазами
 * вылавливать пилатес из ленты всех занятий дня.
 */
export default function ServiceScheduleSheet({
  isOpen,
  onClose,
  serviceId,
  studio,
  onLessonPick,
  refreshKey = 0,
  layer = 1,
}: Props) {
  const { t } = useTranslation();

  const [date, setDate] = useState(() => new Date());
  const [lessons, setLessons] = useState<LessonResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !serviceId) return;

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await getLessonsByDate(isoDate(date));
        // ponytail: студию фильтровать нечем — LessonResponse её не отдаёт.
        // Отсекаем по услуге; студия пока только контекст в шапке листа.
        if (!cancelled) setLessons(data.filter((lesson) => lesson.name === serviceId));
      } catch (error) {
        console.error('Помилка завантаження розкладу послуги:', error);
        if (!cancelled) setLessons([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, serviceId, date, refreshKey]);

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      layer={layer}
      tall
      kicker={studio ? studio.name : t('studio.schedule')}
      title={
        serviceId ? t(`lesson.name.${serviceId}`, { defaultValue: serviceId }) : t('studio.schedule')
      }
      subtitle={studio?.address ?? undefined}
    >
      <div className="-mx-6">
        <WeekRail value={date} onChange={setDate} />
      </div>

      <div className="flex flex-col gap-3 pt-5">
        {isLoading ? (
          <ListSkeleton rows={3} flush />
        ) : lessons.length === 0 ? (
          <EmptyState
            size="sm"
            title={t('studio.no_slots')}
            icon={
              <>
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15 14" />
              </>
            }
          />
        ) : (
          lessons.map((lesson, i) => (
            <LessonCard
              key={lesson.id ?? i}
              lesson={lesson}
              index={i}
              title={t(`lesson.name.${lesson.name}`, { defaultValue: lesson.name })}
              bookedLabel={t('schedule.booked')}
              almostFullLabel={t('schedule.almost_full')}
              availableLabel={t('schedule.available')}
              onClick={() => onLessonPick(lesson)}
            />
          ))
        )}
      </div>
    </Sheet>
  );
}
