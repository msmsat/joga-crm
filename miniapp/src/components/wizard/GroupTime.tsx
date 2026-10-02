import { memo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { LessonResponse } from '../../api/lessons';
import { addDays, formatDay, upperFirst, type IsoDay } from '../../lib/slots';
import { groupMinutes, hhmm } from '../../lib/wizard';
import {
  closedReason, closedTimes, groupTimes, lessonsAt, nextMarked, type DayMarks, type GroupPick,
} from '../../lib/groupWizard';
import { cn } from '../../lib/utils';
import type { GroupWizardFlow } from '../../hooks/useGroupWizard';
import DayStrip from './DayStrip';
import { WizardEmpty } from './WizardRow';

/**
 * Раздел «Время» групповой записи: лента дней и часы занятий выбранного дня
 * по частям дня — те же кнопки, что у индивидуальной записи.
 *
 * Под часом — что в нём идёт: у группы час значит занятие, и «18:00» без
 * названия заставляло бы угадывать. Занятий в час несколько — их число, а
 * какое из них, уточнят «Услуга», «Мастер» или итог. Поэтому кнопок в ряду
 * три, а не четыре: подписи нужна ширина.
 *
 * Полное и закрытое для записи занятие не исчезает — его час стоит погашенной
 * кнопкой с причиной. Отдельного расписания больше нет, и это единственное
 * место, где человек видит день студии целиком: «занятия нет» и «занятие есть,
 * но мест нет» — разные ответы.
 */
export default function GroupTime({ flow }: { flow: GroupWizardFlow }) {
  return (
    <GroupTimeView
      pick={flow.pick}
      lessons={flow.lessons}
      days={flow.days}
      today={flow.today}
      marks={flow.marks}
      loading={flow.dayLoading}
      failed={flow.dayError}
      smooth={flow.isOpen && !flow.opening}
      onPickDay={flow.pickDay}
      onPickTime={flow.pickTime}
      onRetry={flow.retryDay}
    />
  );
}

type ViewProps = {
  pick: GroupPick;
  lessons: LessonResponse[] | null;
  days: IsoDay[];
  today: IsoDay;
  marks: DayMarks | null | undefined;
  loading: boolean;
  failed: boolean;
  smooth: boolean;
  onPickDay: (day: IsoDay) => void;
  onPickTime: (minute: number) => void;
  onRetry: () => void;
};

/**
 * Перерисовывается только при смене данных — дня, выбора, занятий, отметок.
 * Колбэки в сравнении не участвуют: при тех же данных они делают то же самое
 * (всё, что они читают из выбора, и есть эти данные), а новые функции
 * приходят с каждой перерисовкой листа — в том числе в кадре его открытия,
 * где перерисовка собранной заранее вкладки была главной статьёй расходов.
 */
const GroupTimeView = memo(function GroupTimeView({
  pick, lessons: dayLessons, days, today, marks, loading, failed, smooth, onPickDay, onPickTime, onRetry,
}: ViewProps) {
  const { t, i18n } = useTranslation();
  const lessons = dayLessons ?? [];
  const open = groupTimes(lessons, pick);
  const closed = new Set(closedTimes(lessons, pick));
  const groups = groupMinutes([...open, ...closed].sort((a, b) => a - b));
  const lastDay = days[days.length - 1];
  // Пустой день ведёт не «на завтра», а туда, где занятия есть: отметки это
  // уже знают. Без отметок — по-прежнему на следующий день.
  const nearest = marks ? nextMarked(days, marks, pick.day) : null;
  const nextDay = marks ? nearest : pick.day < lastDay ? addDays(pick.day, 1) : null;

  const caption = (minute: number) => {
    if (closed.has(minute)) {
      return t(closedReason(lessons, pick, minute) === 'full' ? 'groupWizard.full' : 'groupWizard.closed');
    }
    const rows = lessonsAt(lessons, pick, minute);
    if (rows.length !== 1) return t('groupWizard.lessonsAt', { count: rows.length });
    return rows[0].name ? t(`lesson.name.${rows[0].name}`, { defaultValue: rows[0].name }) : '';
  };

  const empty = (
    <WizardEmpty
      title={t('groupWizard.noLessons')}
      action={nextDay ? t(marks ? 'groupWizard.nearestDay' : 'wizard.nextDay') : undefined}
      onAction={nextDay ? () => onPickDay(nextDay) : undefined}
    />
  );

  return (
    <div>
      <DayStrip
        days={days}
        today={today}
        value={pick.day}
        onPick={onPickDay}
        rhythm
        marks={marks}
        smooth={smooth}
      />

      <div className="pt-5 text-[15px] font-extrabold tracking-[-0.015em] text-card-foreground">
        {upperFirst(formatDay(pick.day, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }))}
      </div>

      {failed ? (
        <div className="pt-4">
          <WizardEmpty title={t('wizard.loadError')} action={t('booking.retry')} onAction={onRetry} />
        </div>
      ) : loading ? (
        <div aria-busy="true" className="grid grid-cols-3 gap-2 pt-4 @xl:grid-cols-5">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="h-[58px] animate-pulse rounded-2xl bg-background" style={{ animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="pt-4">{empty}</div>
      ) : (
        // key — новый день въезжает целиком, а не перерисовывается на месте.
        <motion.div
          key={pick.day}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          {groups.map((group) => (
            <section key={group.part} className="pt-4">
              <div className="pb-2.5 text-[10px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground">
                {t(`resource.parts.${group.part}`)}
              </div>
              <div className="grid grid-cols-3 gap-2 @xl:grid-cols-5">
                {group.times.map((minute) => {
                  const active = minute === pick.time;
                  const off = closed.has(minute);
                  // Обычная кнопка с CSS-сжатием, а не motion: часы монтируются
                  // вместе с листом, и каждая лишняя пружина — в его первом кадре.
                  return (
                    <button
                      key={minute}
                      type="button"
                      disabled={off}
                      onClick={() => onPickTime(minute)}
                      aria-pressed={active}
                      className={cn(
                        'flex h-[58px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 transition-[transform,background-color,color] duration-200 enabled:active:scale-[0.94]',
                        off ? 'cursor-default text-muted-foreground ring-1 ring-inset ring-border'
                          : active ? 'bg-brand text-brand-foreground shadow-brand'
                          : 'bg-background text-foreground dt:hover:bg-brand/16',
                      )}
                    >
                      <span className={cn('text-[15px] font-bold leading-none tabular-nums', off && 'line-through decoration-1 opacity-60')}>
                        {hhmm(minute)}
                      </span>
                      <span className={cn(
                        'max-w-full truncate text-[10.5px] font-semibold leading-tight',
                        active ? 'text-brand-foreground/70' : 'text-muted-foreground',
                      )}>
                        {caption(minute)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          {/* Есть только полные и закрытые — день виден, но записаться в нём
              некуда: тут же, куда идти дальше. */}
          {open.length === 0 && <div className="pt-4">{empty}</div>}
        </motion.div>
      )}
    </div>
  );
}, (before, after) =>
  before.pick === after.pick
  && before.lessons === after.lessons
  && before.days === after.days
  && before.today === after.today
  && before.marks === after.marks
  && before.loading === after.loading
  && before.failed === after.failed
  && before.smooth === after.smooth);
