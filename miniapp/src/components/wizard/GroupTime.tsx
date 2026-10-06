import { memo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { LessonResponse } from '../../api/lessons';
import type { Studio } from '../../api/studio';
import { addDays, formatDay, upperFirst, type IsoDay } from '../../lib/slots';
import { daySlots, lessonOf, nextMarked, slotsByPart, type DayMarks, type GroupPick } from '../../lib/groupWizard';
import type { GroupWizardFlow } from '../../hooks/useGroupWizard';
import DayStrip from './DayStrip';
import GroupSlot from './GroupSlot';
import { WizardEmpty } from './WizardRow';

/**
 * Раздел «Время» групповой записи: лента дней и занятия выбранного дня
 * карточками по частям дня.
 *
 * У группы час значит занятие, поэтому здесь не кнопки времени, как у
 * индивидуальной записи, а сами занятия: час, название, тренер, места и цена
 * видны сразу. Тап выбирает занятие целиком и ведёт на итог — уточнять
 * направление или тренера, когда в один час занятий несколько, не нужно.
 * Выбранные в «Услуге» и «Мастере» направление и тренер сужают список.
 *
 * Полное и закрытое для записи занятие не исчезает — его карточка погашена,
 * с причиной. Отдельного расписания больше нет, и это единственное место, где
 * человек видит день студии целиком: «занятия нет» и «занятие есть, но мест
 * нет» — разные ответы.
 */
export default function GroupTime({ flow, branches }: { flow: GroupWizardFlow; branches: Studio[] }) {
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
      branches={branches}
      scope={flow.scope}
      onPickDay={flow.pickDay}
      onPickLesson={flow.pickLesson}
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
  branches: Studio[];
  /** Филиал, с которым открыт лист; `null` — все. */
  scope: number | null;
  onPickDay: (day: IsoDay) => void;
  onPickLesson: (lesson: LessonResponse) => void;
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
  pick, lessons: dayLessons, days, today, marks, loading, failed, smooth, branches, scope, onPickDay, onPickLesson, onRetry,
}: ViewProps) {
  const { t, i18n } = useTranslation();
  const lessons = dayLessons ?? [];
  const slots = daySlots(lessons, pick);
  const groups = slotsByPart(slots);
  const bookable = slots.some((slot) => slot.state === 'open' || slot.state === 'mine');
  const chosen = lessonOf(lessons, pick)?.id ?? null;
  // Адрес под тренером — только когда лист открыт на «Все филиалы» и их несколько.
  const placeOf = (branchId: number | null) =>
    branches.length > 1 && scope === null ? branches.find((row) => row.id === branchId)?.name : undefined;
  const lastDay = days[days.length - 1];
  // Пустой день ведёт не «на завтра», а туда, где занятия есть: отметки это
  // уже знают. Без отметок — по-прежнему на следующий день.
  const nearest = marks ? nextMarked(days, marks, pick.day) : null;
  const nextDay = marks ? nearest : pick.day < lastDay ? addDays(pick.day, 1) : null;

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
        // Заглушки той же высоты, что карточки: пришедший день не двигает лист.
        <div aria-busy="true" className="grid gap-2 pt-4 @xl:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-[84px] animate-pulse rounded-[20px] bg-background" style={{ animationDelay: `${i * 70}ms` }} />
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
              <div className="grid gap-2 @xl:grid-cols-2">
                {group.slots.map((slot) => (
                  <GroupSlot
                    key={slot.lesson.id}
                    slot={slot}
                    active={slot.lesson.id === chosen}
                    place={placeOf(slot.lesson.branch_id)}
                    onPick={() => onPickLesson(slot.lesson)}
                  />
                ))}
              </div>
            </section>
          ))}
          {/* Есть только полные и закрытые — день виден, но записаться в нём
              некуда: тут же, куда идти дальше. */}
          {!bookable && <div className="pt-4">{empty}</div>}
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
  && before.smooth === after.smooth
  && before.branches === after.branches
  && before.scope === after.scope);
