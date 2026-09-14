import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { ListSkeleton } from '../../components/ui/ListSkeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { useBusinessTerms } from '../../hooks/useBusinessTerms';
import { useResourceStaff } from '../../hooks/useResourceStaff';
import { useNearestSlots } from '../../hooks/useNearestSlots';
import { useTelegram } from '../../hooks/useTelegram';
import ServiceFilter from './components/ServiceFilter';
import MasterCard, { AnyMasterCard } from './components/MasterCard';
import BookingSheet from './components/BookingSheet';
import {
  ANY, bookingPageReducer, fullName, initialBookingPage, isBookableResource, masterPills, offeredServices,
  reconcile, showAnyMaster, teacherIdOf, visibleStaff, type BookingPageAction, type MasterChoice,
} from '../../lib/bookingPage';
import { dayOf, formatDay, lastBookableDay, relativeDay, studioToday, timeOf } from '../../lib/slots';
import type { StudioCatalog, StudioService } from '../../api/studio';
import type { useResourceBooking } from '../../hooks/useResourceBooking';

type Props = {
  catalog: StudioCatalog | null;
  resource: ReturnType<typeof useResourceBooking>;
};

const personIcon = (
  <>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M6 20v-1.5a6 6 0 0112 0V20" />
  </>
);

/**
 * «Записатись» для индивидуальной записи: к кому и на что — на одном экране.
 *
 * Сверху узкая строка услуг-фильтров, сразу под ней мастера. День и время на
 * этом экране не показываются вовсе: пока человек не выбрал мастера, календарь
 * отвечает на вопрос, которого он ещё не задавал. Время — в листе, после
 * касания мастера (BookingSheet).
 *
 * Список мастеров не зависит ни от дня, ни от их занятости: мастер, у которого
 * сегодня нет окна, всё равно тот, к кому можно записаться. Услуга фильтрует
 * только по тому, оказывает ли он её.
 */
export default function BookingPage({ catalog, resource }: Props) {
  const { t, i18n } = useTranslation();
  const terms = useBusinessTerms('resource');
  const { vibrateLight } = useTelegram();
  const branches = catalog?.branches ?? [];
  const services = catalog?.services ?? [];

  const [page, setPage] = useState(() => initialBookingPage(branches[0]?.id ?? null));
  // Каталог мог доехать позже первого рендера (перечитан после входа).
  const branchId = branches.some((branch) => branch.id === page.branchId) ? page.branchId : branches[0]?.id ?? null;

  const { staff, reason, error, isLoading, retry } = useResourceStaff(branchId);
  const view = reconcile({ ...page, branchId }, staff, services);
  const list = staff ?? [];
  const offered = offeredServices(list, services);
  const visible = visibleStaff(list, view.serviceId);

  const today = studioToday(catalog?.studio.tz_iana);
  const { nearest, earliest } = useNearestSlots(
    view.serviceId, branchId, today, lastBookableDay(today, catalog?.rules.booking_window_days));

  /** Переход автомата. Считается от того, что на экране, — от сверенного состояния. */
  const apply = (action: BookingPageAction) => {
    const next = bookingPageReducer(view, action);
    setPage(next);
    return next;
  };

  const openTime = (master: MasterChoice, serviceId: number) => {
    const service = services.find((row) => row.id === serviceId);
    if (!service || !branchId) return;
    const member = master === ANY ? null : list.find((row) => row.teacher_id === master) ?? null;
    resource.open(
      {
        id: service.id, name: service.name, terminology_profile: service.terminology_profile,
        duration_min: service.duration_min, price_str: service.price_str,
      },
      branchId,
      null,
      { teacherId: teacherIdOf(master), teacherName: member ? fullName(member) : null },
    );
  };

  const openMaster = (master: MasterChoice) => {
    const next = apply({ type: 'openMaster', master, staff: list, services });
    if (next.sheet?.serviceId != null) openTime(next.sheet.master, next.sheet.serviceId);
  };

  const pickService = (service: StudioService) => {
    const next = apply({ type: 'pickService', serviceId: service.id });
    if (next.sheet) openTime(next.sheet.master, service.id);
  };

  const when = (localStart: string) => {
    const day = dayOf(localStart);
    const relative = relativeDay(day, today);
    const dayText = relative ? t(`booking.${relative}`) : formatDay(day, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
    return `${dayText}, ${timeOf(localStart)}`;
  };
  const hint = (teacherId: number): string | null | undefined => {
    if (nearest === null) return undefined;
    const first = nearest.get(teacherId);
    return first ? when(first) : null;
  };

  const hasCatalogServices = services.some(isBookableResource);

  return (
    <>
      {/* Филиал — не фильтр, а смена контекста: мастера принадлежат адресу. */}
      {branches.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-5 pt-6 dt:flex-wrap dt:overflow-visible">
          {branches.map((branch) => {
            const active = branch.id === branchId;
            return (
              <motion.button
                key={branch.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  vibrateLight();
                  apply({ type: 'branch', branchId: branch.id });
                }}
                whileTap={{ scale: 0.95 }}
                className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full pl-3 pr-4 text-[12.5px] font-bold tracking-[-0.01em] ${
                  active ? 'bg-foreground text-background' : 'bg-card text-foreground shadow-soft'
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 opacity-70">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {branch.name}
              </motion.button>
            );
          })}
        </div>
      )}

      <ServiceFilter
        services={offered}
        selected={view.serviceId}
        loading={isLoading}
        onSelect={(serviceId) => apply({ type: 'service', serviceId, staff: list })}
      />

      <SectionLabel trailing={staff && visible.length > 0 ? String(visible.length) : undefined}>
        {terms.staff?.plural ?? t('booking.masters')}
      </SectionLabel>

      <div className="flex flex-col gap-2.5 px-5 dt:gap-3">
        {isLoading ? (
          <ListSkeleton rows={3} flush />
        ) : error ? (
          <div className="flex flex-col items-center">
            <EmptyState
              title={error.status === 409 ? t('booking.unavailable') : t('booking.loadError')}
              hint={error.status === 409 ? t('booking.unavailableHint') : undefined}
              icon={personIcon}
            />
            {error.status !== 409 && <PillButton onClick={retry}>{t('booking.retry')}</PillButton>}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            title={hasCatalogServices ? t('booking.noStaff') : t('booking.reason.no_services')}
            hint={reason === 'no_eligible_staff' ? t('booking.noStaffHint') : undefined}
            icon={personIcon}
          />
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center">
            <EmptyState title={t('booking.noStaffForService')} icon={personIcon} />
            <PillButton onClick={() => apply({ type: 'service', serviceId: null, staff: list })}>
              {t('booking.showAllMasters')}
            </PillButton>
          </div>
        ) : (
          <>
            {showAnyMaster(visible) && (
              <AnyMasterCard
                nearest={nearest === null ? undefined : earliest ? when(earliest) : null}
                selected={view.master === ANY}
                onClick={() => openMaster(ANY)}
              />
            )}
            {visible.map((member, index) => (
              <MasterCard
                key={member.teacher_id}
                member={member}
                index={index + 1}
                pills={masterPills(member, services, view.serviceId)}
                highlight={view.serviceId}
                nearest={hint(member.teacher_id)}
                selected={view.master === member.teacher_id}
                onClick={() => openMaster(member.teacher_id)}
              />
            ))}
          </>
        )}
      </div>

      <BookingSheet
        state={view}
        staff={list}
        services={services}
        flow={resource}
        onPickService={pickService}
        onBack={() => {
          apply({ type: 'backToServices' });
          resource.close();
        }}
        onClose={() => {
          apply({ type: 'close' });
          resource.close();
        }}
        onBooked={() => {
          apply({ type: 'booked' });
          resource.close();
        }}
      />
    </>
  );
}

function PillButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      className="-mt-6 min-h-11 rounded-full bg-card px-5 text-[13.5px] font-extrabold text-foreground shadow-soft"
    >
      {children}
    </motion.button>
  );
}
