import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { LessonResponse } from '../../api/lessons';
import type { GroupWizardFlow } from '../../hooks/useGroupWizard';
import { formatDay, relativeDay } from '../../lib/slots';
import { hhmm } from '../../lib/wizard';
import { serviceIdsOf, teacherIdsOf, timesOf } from '../../lib/groupWizard';
import { Initials } from '../home/PickSheet';
import WizardRow, { RowSkeleton, WizardEmpty } from './WizardRow';

type Option = { id: number; title: string; lead: ReactNode; aside?: string; match: (lesson: LessonResponse) => boolean };

/** Что уже выбрано, — строкой над списком: «Занятия в 18:00 · сегодня». */
function Context({ parts }: { parts: (string | null | undefined)[] }) {
  const text = parts.filter(Boolean).join(' · ');
  return text ? <div className="pb-3 text-[12.5px] font-bold text-muted-foreground">{text}</div> : null;
}

/**
 * Список направлений или тренеров.
 *
 * Час назван — только те, у кого в этот час есть занятие (как у индивидуальной
 * записи). Не назван — все, но идущие в выбранный день стоят первыми, и в
 * строке их часы: «09:00 · 18:00». Остальные не прячутся — человек может
 * выбрать направление, а день потом, — но честно подписаны «в этот день нет».
 */
function ChoiceList({ flow, options, available, active, onPick, emptyTitle }: {
  flow: GroupWizardFlow;
  options: Option[];
  available: Set<number>;
  active: number | null;
  onPick: (id: number) => void;
  emptyTitle: string;
}) {
  const { t, i18n } = useTranslation();
  const { pick } = flow;
  if (flow.dayLoading) return <RowSkeleton />;
  if (flow.dayError) return <WizardEmpty title={t('wizard.loadError')} action={t('booking.retry')} onAction={flow.retryDay} />;

  const lessons = flow.lessons ?? [];
  const relative = relativeDay(pick.day, flow.today);
  const day = relative ? t(`booking.${relative}`) : formatDay(pick.day, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  const withTimes = options.map((option) => ({ ...option, times: timesOf(lessons, option.match) }));
  const list = pick.time !== null
    ? withTimes.filter((option) => available.has(option.id))
    // Стабильная сортировка: внутри «есть сегодня» и «нет» — порядок студии.
    : [...withTimes].sort((a, b) => Number(b.times.length > 0) - Number(a.times.length > 0));

  return (
    <>
      <Context parts={[pick.time !== null ? t('groupWizard.at', { time: hhmm(pick.time) }) : null, day]} />
      {list.length === 0 ? (
        <WizardEmpty
          title={pick.time !== null ? t('groupWizard.noneAt', { time: hhmm(pick.time) }) : emptyTitle}
          action={pick.time !== null ? t('wizard.otherTime') : undefined}
          onAction={() => flow.goTo('time')}
        />
      ) : (
        <div className="grid gap-2.5 @xl:grid-cols-2">
          {list.map((option, index) => (
            <WizardRow
              key={option.id}
              index={index}
              active={active === option.id}
              lead={option.lead}
              title={option.title}
              hint={option.times.length > 0 ? option.times.map(hhmm).join(' · ') : t('groupWizard.notThisDay')}
              aside={option.aside}
              onClick={() => onPick(option.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}

/** Раздел «Услуга»: групповые направления студии. */
export function GroupServices({ flow }: { flow: GroupWizardFlow }) {
  const { t } = useTranslation();
  const options: Option[] = flow.services.map((service) => ({
    id: service.id,
    title: t(`lesson.name.${service.name}`, { defaultValue: service.name }),
    aside: service.price_str,
    lead: (
      <span className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-brand/12 text-brand">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z" />
        </svg>
      </span>
    ),
    match: (lesson) => lesson.service_id === service.id,
  }));
  return (
    <ChoiceList
      flow={flow}
      options={options}
      available={serviceIdsOf(flow.lessons ?? [], flow.pick)}
      active={flow.serviceId}
      onPick={flow.pickService}
      emptyTitle={t('booking.reason.no_services')}
    />
  );
}

/** Раздел «Мастер»: тренеры студии. */
export function GroupTeachers({ flow }: { flow: GroupWizardFlow }) {
  const { t } = useTranslation();
  const options: Option[] = flow.staff.map((member) => ({
    id: member.id,
    title: member.name,
    lead: <Initials text={member.name} />,
    match: (lesson) => lesson.teacher_id === member.id,
  }));
  return (
    <ChoiceList
      flow={flow}
      options={options}
      available={teacherIdsOf(flow.lessons ?? [], flow.pick)}
      active={flow.teacherId}
      onPick={flow.pickTeacher}
      emptyTitle={t('wizard.noMasters')}
    />
  );
}
