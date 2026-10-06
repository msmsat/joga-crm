import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveImageUrl } from '../../api/client';
import type { ResourceStaffMember } from '../../api/hybrid.types';
import { useServicePrice } from '../../hooks/useServicePrice';
import { useServiceDuration } from '../../hooks/useServiceDuration';
import type { BookingWizardFlow } from '../../hooks/useBookingWizard';
import { ANY, fullName, initials } from '../../lib/bookingPage';
import { hhmm, masterChoices, offerAny, onService, serviceChoices, type WizardPick } from '../../lib/wizard';
import WizardRow, { RowSkeleton, WizardEmpty } from './WizardRow';

/** Что уже выбрано, — строкой над списком: «Свободно в 18:00 · у Анны». */
function Context({ parts }: { parts: (string | null | undefined)[] }) {
  const text = parts.filter(Boolean).join(' · ');
  return text ? <div className="pb-3 text-[12.5px] font-bold text-muted-foreground">{text}</div> : null;
}

/** Примерка выбора под мышью (десктоп): колонка шагов показывает, что будет. */
export type Preview = (pick: WizardPick | null) => void;

/**
 * Список вариантов. На широкой правой колонке консоли — в две колонки
 * (`@xl` — ширина самой колонки, а не окна). Мышь ушла со списка — примерка
 * гаснет; между строками она держится, иначе колонка шагов мигала бы на
 * каждом зазоре.
 */
function ChoiceList({ children, onPreview }: { children: React.ReactNode; onPreview?: Preview }) {
  return (
    <div className="grid gap-2.5 @xl:grid-cols-2" onPointerLeave={onPreview ? () => onPreview(null) : undefined}>
      {children}
    </div>
  );
}

/** Раздел «Услуга»: услуги мастера (если он выбран), свободные в названный час. */
export function WizardServices({ flow, onPreview }: { flow: BookingWizardFlow; onPreview?: Preview }) {
  const { t } = useTranslation();
  const priceOf = useServicePrice();
  const durationOf = useServiceDuration();
  const { pick } = flow;
  if (flow.staffError) return <WizardEmpty title={t('wizard.loadError')} action={t('booking.retry')} onAction={flow.retryStaff} />;
  if (pick.time !== null && flow.dayError) return <WizardEmpty title={t('wizard.loadError')} action={t('booking.retry')} onAction={flow.retryDay} />;
  if (flow.staffLoading || (pick.time !== null && flow.dayLoading)) return <RowSkeleton />;

  const ids = serviceChoices(flow.services.map((row) => row.id), flow.staff, flow.rows ?? [], pick);
  const list = flow.services.filter((row) => ids.includes(row.id));
  return (
    <>
      <Context parts={[
        pick.time !== null ? t('wizard.freeAt', { time: hhmm(pick.time) }) : null,
        flow.master ? fullName(flow.master) : null,
      ]} />
      {list.length === 0 ? (
        <WizardEmpty
          title={pick.time !== null ? t('wizard.noServicesAt', { time: hhmm(pick.time) }) : t('booking.reason.no_services')}
          action={pick.time !== null ? t('wizard.otherTime') : undefined}
          onAction={() => flow.goTo('time')}
        />
      ) : (
        <ChoiceList onPreview={onPreview}>
          {list.map((service, index) => (
            <WizardRow
              key={service.id}
              index={index}
              active={pick.serviceId === service.id}
              lead={
                <span className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-brand/12 text-brand">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M11 3l1.8 5.2L18 10l-5.2 1.8L11 17l-1.8-5.2L4 10l5.2-1.8z" />
                  </svg>
                </span>
              }
              title={t(`lesson.name.${service.name}`, { defaultValue: service.name })}
              hint={durationOf(service, flow.master)}
              aside={priceOf(service, flow.master)}
              onClick={() => flow.pickService(service.id)}
              onHover={onPreview && (() => onPreview(onService(pick, service.id, flow.staff)))}
            />
          ))}
        </ChoiceList>
      )}
    </>
  );
}

export function Avatar({ member, size = 48 }: { member: ResourceStaffMember; size?: 48 | 56 }) {
  const [broken, setBroken] = useState(false);
  const photo = broken ? undefined : resolveImageUrl(member.photo_url);
  const box = size === 56 ? 'h-14 w-14' : 'h-12 w-12';
  return photo ? (
    <img src={photo} alt="" onError={() => setBroken(true)} className={`${box} rounded-full object-cover`} />
  ) : (
    <span className={`${box} flex items-center justify-center rounded-full bg-brand/12 text-[15px] font-extrabold text-brand`}>
      {initials(member)}
    </span>
  );
}

/** Раздел «Мастер»: кто делает выбранную услугу и свободен в названный час. */
export function WizardMasters({ flow, onPreview }: { flow: BookingWizardFlow; onPreview?: Preview }) {
  const { t } = useTranslation();
  const { pick } = flow;
  if (flow.staffError) return <WizardEmpty title={t('wizard.loadError')} action={t('booking.retry')} onAction={flow.retryStaff} />;
  if (pick.time !== null && flow.dayError) return <WizardEmpty title={t('wizard.loadError')} action={t('booking.retry')} onAction={flow.retryDay} />;
  if (flow.staffLoading || (pick.time !== null && flow.dayLoading)) return <RowSkeleton />;

  const list = masterChoices(flow.staff, flow.rows ?? [], pick);
  const serviceName = flow.service ? t(`lesson.name.${flow.service.name}`, { defaultValue: flow.service.name }) : null;
  const priceAt = (member: ResourceStaffMember) =>
    flow.service ? member.service_price_strs?.[flow.service.id] : undefined;

  return (
    <>
      <Context parts={[pick.time !== null ? t('wizard.freeAt', { time: hhmm(pick.time) }) : null, serviceName]} />
      {list.length === 0 ? (
        <WizardEmpty
          title={t('wizard.noMasters')}
          action={pick.time !== null ? t('wizard.otherTime') : undefined}
          onAction={() => flow.goTo('time')}
        />
      ) : (
        <ChoiceList onPreview={onPreview}>
          {offerAny(list) && (
            <WizardRow
              index={0}
              active={pick.master === ANY}
              lead={
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><circle cx="17" cy="9" r="2.4" /><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5" />
                  </svg>
                </span>
              }
              title={t('wizard.anyMaster')}
              hint={t('wizard.anyMasterHint')}
              onClick={() => flow.pickMaster(ANY)}
              onHover={onPreview && (() => onPreview({ ...pick, master: ANY }))}
            />
          )}
          {list.map((member, index) => (
            <WizardRow
              key={member.teacher_id}
              index={index + 1}
              active={pick.master === member.teacher_id}
              lead={<Avatar member={member} />}
              title={fullName(member)}
              hint={member.department ?? undefined}
              aside={priceAt(member)}
              onClick={() => flow.pickMaster(member.teacher_id)}
              onHover={onPreview && (() => onPreview({ ...pick, master: member.teacher_id }))}
            />
          ))}
        </ChoiceList>
      )}
    </>
  );
}
