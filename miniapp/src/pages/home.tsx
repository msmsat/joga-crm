import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import HomeHero, { type BookingStart } from '../components/home/HomeHero';
import PickSheet, { Initials, type PickItem } from '../components/home/PickSheet';
import BookingWizardSheet from '../components/wizard/BookingWizardSheet';
import { STEP_ICONS } from '../components/wizard/stepIcons';
import { type UserResponse } from '../api/auth';
import type { StudioCatalog } from '../api/studio';
import { useBookingWizard } from '../hooks/useBookingWizard';

/** Расписание групп, открытое с главной: без фильтра, по мастеру или по услуге —
 *  и в выбранном на главной филиале (`branch` не задан — во всех). */
export type ScheduleFilter = { teacher?: number; service?: number; branch?: number };

interface HomeProps {
  user: UserResponse | null;
  catalog: StudioCatalog | null;
  /** Переход в другой раздел кабинета. */
  onNavigate: (tab: string) => void;
  /** Отказ 402 ведёт в покупку абонемента — она живёт во вкладке профиля. */
  onBuySubscription: () => void;
  /** Бронь гостя: поднять существующий вход и продолжить ту же запись. */
  onNeedAuth: (retry: () => void) => void;
  /** Групповые занятия: вкладка расписания с фильтром. */
  onOpenSchedule: (filter: ScheduleFilter) => void;
}

/**
 * Главная: название студии и три входа в запись — время, мастер, услуга.
 *
 * Куда ведёт вход, решает механика студии:
 *   resource — мастер записи (время, услуга и мастер в любом порядке, итог, оплата);
 *   event    — расписание групп: «время» — вся неделя, «мастер» и «услуга» —
 *              сначала выбор из списка, потом то же расписание только с ним;
 *   hybrid   — сначала вопрос «индивидуально или в группе», дальше — как выше.
 */
export default function Home({ user, catalog, onNavigate, onBuySubscription, onNeedAuth, onOpenSchedule }: HomeProps) {
  const { t } = useTranslation();
  const mode = catalog?.booking_capabilities.booking_mode ?? 'event';
  const wizard = useBookingWizard({ catalog, onNeedAuth });
  // Гибридная студия: вход выбран, ждём ответа «индивидуально или в группе».
  const [asking, setAsking] = useState<BookingStart | null>(null);
  // Группы: список мастеров или услуг перед расписанием.
  const [groupPick, setGroupPick] = useState<'master' | 'service' | null>(null);
  // Филиал с главной — на весь сеанс, открывается на «Все». Каталог мог
  // перечитаться без выбранного адреса: тогда снова «все», а не пустая запись.
  const [branchPick, setBranchPick] = useState<number | null>(null);
  const branch = catalog?.branches.some((row) => row.id === branchPick) ? branchPick : null;
  const inBranch = branch ?? undefined;

  const group = (start: BookingStart) => {
    if (start === 'time') onOpenSchedule({ branch: inBranch });
    else setGroupPick(start);
  };

  const start = (choice: BookingStart) => {
    if (mode === 'resource') wizard.open(choice, branch);
    else if (mode === 'event') group(choice);
    else setAsking(choice);
  };

  const groupServices = (catalog?.services ?? []).filter((service) => service.booking_mode === 'event');
  const groupItems: PickItem[] = groupPick === 'master'
    ? (catalog?.staff ?? []).map((member) => ({ id: member.id, title: member.name, lead: <Initials text={member.name} /> }))
    : groupServices.map((service) => {
      const title = t(`lesson.name.${service.name}`, { defaultValue: service.name });
      return { id: service.id, title, hint: service.price_str, lead: <Initials text={title} /> };
    });

  const modeItems: PickItem[] = [
    {
      id: 'resource', title: t('hero.mode.resource'), hint: t('hero.mode.resourceHint'),
      lead: <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand p-3 text-brand-foreground">{STEP_ICONS.master}</span>,
    },
    {
      id: 'event', title: t('hero.mode.event'), hint: t('hero.mode.eventHint'),
      lead: <span className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground p-3 text-background">{STEP_ICONS.time}</span>,
    },
  ];

  return (
    <div className="relative">
      <HomeHero
        catalog={catalog}
        name={user?.name ?? ''}
        branch={branch}
        onBranch={setBranchPick}
        onStart={start}
      />

      <PickSheet
        isOpen={asking !== null}
        onClose={() => setAsking(null)}
        kicker={catalog?.studio.name}
        title={t('hero.mode.title')}
        items={modeItems}
        empty=""
        onPick={(id) => {
          const choice = asking;
          setAsking(null);
          if (!choice) return;
          if (id === 'resource') wizard.open(choice, branch);
          else group(choice);
        }}
      />

      <PickSheet
        isOpen={groupPick !== null}
        onClose={() => setGroupPick(null)}
        kicker={t('hero.mode.event')}
        title={groupPick === 'master' ? t('hero.pickMaster') : t('hero.pickService')}
        items={groupItems}
        empty={groupPick === 'master' ? t('wizard.noMasters') : t('booking.reason.no_services')}
        onPick={(id) => {
          const kind = groupPick;
          setGroupPick(null);
          onOpenSchedule(kind === 'master'
            ? { teacher: Number(id), branch: inBranch }
            : { service: Number(id), branch: inBranch });
        }}
      />

      <BookingWizardSheet
        flow={wizard}
        catalog={catalog}
        onBuySubscription={onBuySubscription}
        onMyLessons={() => onNavigate('my')}
      />
    </div>
  );
}
