import { useTranslation } from 'react-i18next';
import type { StudioCatalog } from '../../api/studio';
import type { GroupWizardFlow } from '../../hooks/useGroupWizard';
import { useBusinessTerms } from '../../hooks/useBusinessTerms';
import { formatDay, relativeDay } from '../../lib/slots';
import { hhmm } from '../../lib/wizard';
import { candidates, startOf } from '../../lib/groupWizard';
import { LessonBookingBody } from '../booking/LessonBooking';
import { SummaryRow } from './WizardSummary';
import WizardRow from './WizardRow';

/**
 * Итог групповой записи: выбранное строками, у каждой — переход в свой
 * раздел, ниже — само занятие и коврик, тем же блоком, что в листе брони
 * расписания. Записывает кнопка в подвале листа (GroupWizardSheet).
 *
 * В выбранный час несколько занятий, а уточнять человек не стал — они здесь
 * же списком: выбрать одно из трёх строк быстрее, чем идти в два раздела.
 */
export default function GroupSummary({ flow, catalog }: { flow: GroupWizardFlow; catalog: StudioCatalog | null }) {
  const { t, i18n } = useTranslation();
  const terms = useBusinessTerms('event');
  const { pick, lesson } = flow;
  const branches = catalog?.branches ?? [];

  const relative = relativeDay(pick.day, flow.today);
  const day = relative ? t(`booking.${relative}`) : formatDay(pick.day, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  const when = pick.time !== null ? `${day}, ${hhmm(pick.time)}` : null;
  const name = (value: string) => t(`lesson.name.${value}`, { defaultValue: value });
  const teacher = flow.staff.find((row) => row.id === flow.teacherId)?.name ?? lesson?.teacher ?? null;
  const several = !lesson && pick.time !== null ? candidates(flow.lessons ?? [], pick) : [];
  const placeOf = (branchId: number | null) =>
    branches.length > 1 && flow.scope === null ? branches.find((row) => row.id === branchId)?.name : undefined;

  return (
    <div className="flex flex-col gap-2.5">
      <SummaryRow step="time" label={t('wizard.tabs.time')} value={when} onChange={() => flow.goTo('time')} />
      <SummaryRow
        step="service"
        label={t('wizard.tabs.service')}
        value={flow.service ? name(flow.service.name) : lesson?.name ? name(lesson.name) : null}
        onChange={() => flow.goTo('service')}
      />
      <SummaryRow step="master" label={terms.staff?.singular ?? t('wizard.tabs.master')} value={teacher} onChange={() => flow.goTo('master')} />

      {several.length > 0 && pick.time !== null && (
        <div className="pt-3">
          <div className="pb-2.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
            {t('groupWizard.several', { time: hhmm(pick.time) })}
          </div>
          <div className="grid gap-2.5 @xl:grid-cols-2">
            {several.map((row, index) => (
              <WizardRow
                key={row.id}
                index={index}
                lead={
                  <span className="flex h-12 w-12 flex-col items-center justify-center rounded-[16px] bg-card text-[13px] font-extrabold tabular-nums text-card-foreground shadow-soft">
                    {hhmm(startOf(row))}
                  </span>
                }
                title={row.name ? name(row.name) : ''}
                hint={[row.teacher, placeOf(row.branch_id)].filter(Boolean).join(' · ')}
                aside={row.price_str}
                onClick={() => flow.pickLesson(row)}
              />
            ))}
          </div>
        </div>
      )}

      {lesson && (
        <div className="pt-3">
          {placeOf(lesson.branch_id) && (
            <div className="flex items-center gap-1.5 pb-3 text-[12.5px] font-bold text-muted-foreground">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
              </svg>
              {placeOf(lesson.branch_id)}
            </div>
          )}
          <LessonBookingBody
            lesson={lesson}
            selectedSpot={flow.selectedSpot}
            onSpotSelect={flow.pickSpot}
            allowRepeat={flow.allowRepeat}
          />
        </div>
      )}
    </div>
  );
}
