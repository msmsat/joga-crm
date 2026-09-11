import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { ListSkeleton } from '../../components/ui/ListSkeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Press } from '../../components/ui/Press';
import { useStaffDay } from '../../hooks/useStaffDay';
import { hhmm } from '../../lib/utils';
import MasterCard from './components/MasterCard';
import type { StudioCatalog, StudioService } from '../../api/studio';
import type { useResourceBooking } from '../../hooks/useResourceBooking';

type Props = {
  catalog: StudioCatalog | null;
  /** Филиал держит страница — он же ключ у списка занятий в event-режиме. */
  branchId: number;
  onBranchChange: (id: number) => void;
  /** День берётся у страницы: лента недели у экрана одна на оба режима. */
  date: Date;
  resource: ReturnType<typeof useResourceBooking>;
};

/**
 * Запись на индивидуальную услугу: услуга → мастер → время.
 *
 * ПОРЯДОК ШАГОВ — ТРЕБОВАНИЕ, А НЕ ОФОРМЛЕНИЕ (MA-04). До этого экрана мастер
 * не выбирался вовсе: `teacher_id` не уходил на сервер никогда, и сетка
 * времени была ОБЪЕДИНЕНИЕМ всех подходящих мастеров — клиент видел часы,
 * которые ни одному конкретному человеку не принадлежали, а мастер назначался
 * уже после выбора времени. Здесь мастер называется до времени, и сервер
 * считает часы именно его.
 *
 * ДЕНЬ ИДЁТ ПЕРЕД МАСТЕРОМ по необходимости: «кто работает в этот день» без
 * дня не вычисляется — смена привязана к дате. Ленту дней рисует страница,
 * этот экран её только читает.
 *
 * ЗАНЯТЫЙ МАСТЕР ОСТАЁТСЯ В СПИСКЕ. `works` и `free_count` приходят раздельно
 * именно ради этого: полностью занятая смена — не выходной.
 */
export default function BookingFlow({ catalog, branchId, onBranchChange, date, resource }: Props) {
  const { t } = useTranslation();
  const [serviceId, setServiceId] = useState<number | null>(null);
  const branches = catalog?.branches ?? [];

  const services = useMemo(
    () => (catalog?.services ?? []).filter((s) => s.booking_mode === 'resource' && s.is_bookable),
    [catalog],
  );
  const service = services.find((s) => s.id === serviceId) ?? null;
  const { staff, reason, isPending, isLoading } = useStaffDay(service?.id ?? null, branchId, date);

  // Показываем только тех, кто в этот день на смене. Выходной — это не «мастер
  // без времени», и строка о нём ничего клиенту не даёт.
  const working = staff.filter((row) => row.works);
  const withTime = working.filter((row) => row.free_count > 0);

  const openSheet = (teacherId: number | null) => {
    if (!service) return;
    resource.open(
      { id: service.id, name: service.name, terminology_profile: service.terminology_profile },
      branchId,
      null,
      { teacherId, date },
    );
  };

  return (
    <>
      {/* Филиал — не фильтр, а смена контекста: мастера и их смены принадлежат
          конкретному адресу. Поэтому «Все» здесь нет. */}
      {branches.length > 1 && (
        <>
          <SectionLabel>{t('booking.stepBranch')}</SectionLabel>
          <div className="flex gap-2.5 overflow-x-auto px-5 pb-1 dt:flex-wrap dt:overflow-visible">
            {branches.map((branch) => (
              <Press
                key={branch.id}
                role="button"
                tabIndex={0}
                onClick={() => onBranchChange(branch.id)}
                className={`flex h-10 shrink-0 cursor-pointer items-center rounded-full px-4 text-[12.5px] font-bold tracking-[-0.01em] ${
                  branch.id === branchId ? 'bg-brand text-brand-foreground shadow-brand' : 'bg-card shadow-soft'
                }`}
              >
                {branch.name}
              </Press>
            ))}
          </div>
        </>
      )}

      <SectionLabel>{t('booking.stepService')}</SectionLabel>
      <div className="flex gap-2.5 overflow-x-auto px-5 pb-1 dt:flex-wrap dt:gap-3 dt:overflow-visible">
        {services.map((item) => (
          <ServiceChip
            key={item.id}
            service={item}
            active={item.id === serviceId}
            label={t(`lesson.name.${item.name}`, { defaultValue: item.name })}
            duration={t('booking.duration', { min: item.duration_min })}
            onClick={() => setServiceId(item.id === serviceId ? null : item.id)}
          />
        ))}
      </div>

      {service === null ? (
        <EmptyState
          title={t('booking.pickService')}
          hint={services.length === 0 ? t('booking.reason.no_services') : undefined}
          icon={
            <>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v8M8 12h8" />
            </>
          }
        />
      ) : (
        <>
          <SectionLabel trailing={withTime.length > 0 ? String(withTime.length) : undefined}>
            {t('booking.stepMaster')}
          </SectionLabel>
          <div className="flex flex-col gap-2.5 px-5 dt:gap-3">
            {isLoading ? (
              <ListSkeleton rows={3} flush />
            ) : isPending ? (
              /* Ответа ещё нет, но и скелет рано: первые 250 мс экран молчит.
                 Утверждать «никто не работает» сейчас нельзя — мы не знаем. */
              null
            ) : working.length === 0 ? (
              <EmptyState
                size="sm"
                title={
                  reason && reason !== 'empty'
                    ? t(`booking.reason.${reason}`, { defaultValue: t('booking.noMasters') })
                    : t('booking.noMasters')
                }
                hint={t('booking.noMastersHint')}
                icon={
                  <>
                    <circle cx="12" cy="8" r="3.2" />
                    <path d="M6 20v-1.5a6 6 0 0112 0V20" />
                  </>
                }
              />
            ) : (
              <>
                {/* «Любой» остаётся первым: клиенту, которому важно время, а не
                    человек, выбор мастера — лишний шаг (MA-05). Показывается
                    только когда есть из чего выбирать. */}
                {withTime.length > 1 && (
                  <Press
                    role="button"
                    tabIndex={0}
                    onClick={() => openSheet(null)}
                    className="flex cursor-pointer items-center gap-3.5 rounded-[20px] bg-card px-4 py-3.5 shadow-soft dt:px-5 dt:py-4"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand/12 dt:h-14 dt:w-14">
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--v-brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                        <circle cx="9" cy="8" r="3" />
                        <path d="M3 20v-1a5 5 0 0110 0v1M16 11a3 3 0 100-6M18 20v-1a5 5 0 00-2-4" />
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] font-extrabold tracking-[-0.015em] text-card-foreground dt:text-[15px]">
                        {t('booking.anyMaster')}
                      </div>
                      <div className="mt-0.5 text-[12px] font-semibold text-muted-foreground dt:text-[12.5px]">
                        {t('booking.anyMasterHint')}
                      </div>
                    </div>
                  </Press>
                )}

                {/* Все на смене, но свободного времени нет ни у кого. Без этой
                    строки экран — тупик: список есть, нажать нечего, и почему
                    так, человеку взять неоткуда. */}
                {withTime.length === 0 && (
                  <p className="px-1 pb-1 text-[12.5px] font-semibold leading-relaxed text-muted-foreground">
                    {t('booking.allBusy')} {t('booking.noMastersHint')}
                  </p>
                )}

                {working.map((master, index) => (
                  <MasterCard
                    key={master.teacher_id}
                    master={master}
                    index={index}
                    freeLabel={
                      /* Без `count`: i18next принял бы его за множественное
                         число и пошёл искать формы `_one`/`_other`, которых у
                         этого ключа нет. Счёт стоит в метке раздела. */
                      master.first_free ? t('booking.firstFree', { time: hhmm(master.first_free) }) : ''
                    }
                    busyLabel={t('booking.noFreeTime')}
                    onClick={() => openSheet(master.teacher_id)}
                  />
                ))}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

function ServiceChip({
  service, active, label, duration, onClick,
}: {
  service: StudioService; active: boolean; label: string; duration: string; onClick: () => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Press
        role="button"
        tabIndex={0}
        onClick={onClick}
        className={`flex shrink-0 cursor-pointer flex-col gap-0.5 rounded-[18px] px-4 py-3 transition-shadow duration-300 dt:px-5 dt:py-3.5 ${
          active ? 'bg-brand text-brand-foreground shadow-brand' : 'bg-card shadow-soft'
        }`}
      >
        <span className="whitespace-nowrap text-[13.5px] font-extrabold tracking-[-0.015em]">
          {label}
        </span>
        <span
          className={`whitespace-nowrap text-[11.5px] font-semibold tabular-nums ${
            active ? 'text-brand-foreground/80' : 'text-muted-foreground'
          }`}
        >
          {duration} · {service.price_str}
        </span>
      </Press>
    </motion.div>
  );
}
