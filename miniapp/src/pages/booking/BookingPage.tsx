import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { ListSkeleton } from '../../components/ui/ListSkeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { useBusinessTerms } from '../../hooks/useBusinessTerms';
import { useResourceStaff } from '../../hooks/useResourceStaff';
import { useNearestSlots } from '../../hooks/useNearestSlots';
import ServiceFilter from './components/ServiceFilter';
import BranchFilter from './components/BranchFilter';
import MasterCard, { AnyMasterCard } from './components/MasterCard';
import BookingSheet from './components/BookingSheet';
import {
  ANY, bookingPageReducer, fullName, initialBookingPage, isBookableResource, masterPills, offeredServices,
  reconcile, showAnyMaster, staffBranches, teacherIdOf, visibleStaff,
  type BookingPageAction, type BookingSheetState, type MasterChoice,
} from '../../lib/bookingPage';
import { ALL_BRANCHES, knownBranches } from '../../lib/branchSelection';
import { dayOf, formatDay, lastBookableDay, relativeDay, studioToday, timeOf } from '../../lib/slots';
import type { StudioCatalog, StudioService } from '../../api/studio';
import type { useResourceBooking } from '../../hooks/useResourceBooking';

type Props = {
  catalog: StudioCatalog | null;
  resource: ReturnType<typeof useResourceBooking>;
  /** Услуга из QR-кода студии: экран открывается с её мастерами. */
  focusServiceId?: number;
};

const personIcon = (
  <>
    <circle cx="12" cy="8" r="3.2" />
    <path d="M6 20v-1.5a6 6 0 0112 0V20" />
  </>
);

/**
 * Место карточки в списке. Смена услуги убирает одних мастеров и возвращает
 * других: без этого ушедшие пропадали мгновенно, а оставшиеся рывком
 * перескакивали на их место. Уходящая карточка гаснет вне потока (`popLayout`),
 * остальные доезжают до новых мест. Только позиция — растянутый по высоте
 * текст выглядел бы хуже рывка. Появление — у самой карточки (MasterCard).
 */
const slot = {
  layout: 'position',
  exit: { opacity: 0, scale: 0.97 },
  transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
} as const;

/**
 * «Записатись» для индивидуальной записи: к кому и на что — на одном экране.
 *
 * Сверху филиалы («Все» или любые из них), под ними узкая строка
 * услуг-фильтров, дальше мастера. День и время на этом экране не показываются
 * вовсе: пока человек не выбрал мастера, календарь отвечает на вопрос, которого
 * он ещё не задавал. Время — в листе, после касания мастера (BookingSheet).
 *
 * Список мастеров не зависит ни от дня, ни от их занятости: мастер, у которого
 * сегодня нет окна, всё равно тот, к кому можно записаться. Услуга фильтрует
 * только по тому, оказывает ли он её.
 */
export default function BookingPage({ catalog, resource, focusServiceId }: Props) {
  const { t, i18n } = useTranslation();
  const terms = useBusinessTerms('resource');
  const branches = catalog?.branches ?? [];
  const services = catalog?.services ?? [];

  const [page, setPage] = useState(() => initialBookingPage(ALL_BRANCHES));

  // Услуга из QR-кода приезжает не к первому кадру: раздел зависит от механики
  // услуги, а её называет каталог. Поэтому не начальное состояние, а эффект —
  // и ровно один раз: дальше фильтром распоряжается человек, и вернуть его к
  // услуге с плаката на каждый перерендер значило бы отобрать у него выбор.
  const focused = useRef(false);
  useEffect(() => {
    if (focusServiceId == null || focused.current) return;
    focused.current = true;
    setPage((current) => ({ ...current, serviceId: focusServiceId }));
  }, [focusServiceId]);
  // Каталог мог доехать позже первого рендера (перечитан после входа): филиал,
  // которого в нём нет, выбранным не считается.
  const branchIds = knownBranches(page.branchIds, branches.map((branch) => branch.id));

  const { staff, reason, error, isLoading, retry } = useResourceStaff(branchIds);
  const view = reconcile({ ...page, branchIds }, staff, services);
  const list = staff ?? [];
  const offered = offeredServices(list, services);
  const visible = visibleStaff(list, view.serviceId);

  const today = studioToday(catalog?.studio.tz_iana);
  const { nearest, earliest, isLoading: nearestLoading } = useNearestSlots(
    view.serviceId, staffBranches(visible), today, lastBookableDay(today, catalog?.rules.booking_window_days));

  // Адрес на карточке — только когда из выбора не ясно, где мастер принимает.
  const showPlaces = branches.length > 1 && branchIds.length !== 1;
  const placeOf = (ids: number[]) => showPlaces
    ? branches.filter((branch) => ids.includes(branch.id)).map((branch) => branch.name).join(', ')
    : undefined;

  /** Переход автомата. Считается от того, что на экране, — от сверенного состояния. */
  const apply = (action: BookingPageAction) => {
    const next = bookingPageReducer(view, action);
    setPage(next);
    return next;
  };

  /** Время открывается, когда известны и услуга, и адрес. */
  const openTime = (sheet: BookingSheetState | null) => {
    if (!sheet || sheet.serviceId === null || sheet.branchId === null) return;
    const service = services.find((row) => row.id === sheet.serviceId);
    if (!service) return;
    const member = sheet.master === ANY ? null : list.find((row) => row.teacher_id === sheet.master) ?? null;
    resource.open(
      {
        id: service.id, name: service.name, terminology_profile: service.terminology_profile,
        duration_min: service.duration_min, price_str: service.price_str,
      },
      sheet.branchId,
      null,
      { teacherId: teacherIdOf(sheet.master), teacherName: member ? fullName(member) : null },
    );
  };

  const openMaster = (master: MasterChoice) =>
    openTime(apply({ type: 'openMaster', master, staff: list, services }).sheet);

  const pickService = (service: StudioService) =>
    openTime(apply({ type: 'pickService', serviceId: service.id, staff: list }).sheet);

  const pickBranch = (branchId: number) => openTime(apply({ type: 'pickBranch', branchId }).sheet);

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
      {/* Филиалы — смена контекста: мастера принадлежат адресу. */}
      <BranchFilter
        branches={branches}
        selected={branchIds}
        onChange={(next) => apply({ type: 'branches', branchIds: next })}
      />

      <ServiceFilter
        services={offered}
        selected={view.serviceId}
        loading={isLoading}
        onSelect={(serviceId) => apply({ type: 'service', serviceId, staff: list })}
      />

      <SectionLabel trailing={staff && visible.length > 0 ? String(visible.length) : undefined}>
        {terms.staff?.plural ?? t('booking.masters')}
      </SectionLabel>

      {/* `relative` — точка отсчёта для уходящих карточек (`popLayout`). */}
      <div className="relative flex flex-col gap-2.5 px-5 dt:gap-3">
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
          <AnimatePresence mode="popLayout">
            {showAnyMaster(visible) && (
              <motion.div key="any" {...slot}>
                <AnyMasterCard
                  nearest={nearest === null ? undefined : earliest ? when(earliest) : null}
                  loading={nearestLoading}
                  selected={view.master === ANY}
                  onClick={() => openMaster(ANY)}
                />
              </motion.div>
            )}
            {visible.map((member, index) => (
              <motion.div key={member.teacher_id} {...slot}>
                <MasterCard
                  member={member}
                  index={index + 1}
                  pills={masterPills(member, services, view.serviceId)}
                  highlight={view.serviceId}
                  place={placeOf(member.branch_ids)}
                  nearest={hint(member.teacher_id)}
                  loading={nearestLoading}
                  selected={view.master === member.teacher_id}
                  onClick={() => openMaster(member.teacher_id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <BookingSheet
        state={view}
        staff={list}
        services={services}
        branches={branches}
        flow={resource}
        onPickService={pickService}
        onPickBranch={pickBranch}
        onBack={() => {
          apply({ type: 'back' });
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
