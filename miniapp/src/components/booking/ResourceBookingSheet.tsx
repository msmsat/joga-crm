import { useTranslation } from 'react-i18next';
import { Sheet, SheetAction } from '../ui/Sheet';
import WeekRail from '../schedule/WeekRail';
import { ListSkeleton } from '../ui/ListSkeleton';
import { EmptyState } from '../ui/EmptyState';
import { Press } from '../ui/Press';
import { useBusinessTerms } from '../../hooks/useBusinessTerms';
import type { useResourceBooking } from '../../hooks/useResourceBooking';

/**
 * HB-20: выбор времени и подтверждение индивидуальной записи.
 *
 * ВРЕМЯ ПОКАЗЫВАЕТСЯ ТАК, КАК ЕГО НАЗВАЛ СЕРВЕР. `local_start` — местное время
 * студии, и печатается оно как строка, без `new Date()`: превращение в Date
 * подставило бы часовой пояс телефона, и клиент из другой страны увидел бы
 * чужой час (AC-21).
 *
 * ПОДТВЕРЖДЕНИЕ ПОКАЗЫВАЕТ УСЛОВИЯ СЕРВЕРА. Цена, основание оплаты и
 * следующий шаг берутся из quote, а не пересчитываются здесь.
 */
type Flow = ReturnType<typeof useResourceBooking>;

const hhmm = (localStart: string) => localStart.slice(11, 16);

export default function ResourceBookingSheet({ flow, layer = 1 }: { flow: Flow; layer?: number }) {
  const { t } = useTranslation();
  const terms = useBusinessTerms('resource', flow.service?.terminology_profile ?? null);
  const { service, quote, booking, step } = flow;

  const funding = quote?.terms.domain.funding;
  const priceLabel = funding
    ? funding.kind === 'pay'
      ? `${funding.price} ${funding.currency}`
      : t(`resource.funding.${funding.kind}`)
    : '';

  const footer =
    step === 'quote' && quote ? (
      <SheetAction onClick={() => void flow.confirm()}>
        {terms.ready ? terms.message('confirm_booking') : t('resource.confirm')}
      </SheetAction>
    ) : step === 'confirming' ? (
      <SheetAction onClick={() => {}} disabled>
        {t('resource.confirming')}
      </SheetAction>
    ) : step === 'done' && booking ? (
      <SheetAction onClick={flow.close}>{t('resource.done')}</SheetAction>
    ) : undefined;

  return (
    <Sheet
      isOpen={service !== null}
      onClose={flow.close}
      layer={layer}
      tall
      kicker={terms.offering?.singular ?? t('resource.kicker')}
      title={service?.name ?? ''}
      footer={footer}
    >
      {step === 'select_time' && (
        <>
          <div className="-mx-6">
            <WeekRail value={flow.date} onChange={flow.setDate} />
          </div>
          <div className="pt-5">
            {flow.isLoading ? (
              <ListSkeleton rows={3} flush />
            ) : flow.slots.length === 0 ? (
              <EmptyState
                size="sm"
                title={
                  flow.reason === 'config_incomplete'
                    ? t('resource.reason.config_incomplete')
                    : terms.ready
                      ? terms.message('empty_slots')
                      : t('studio.no_slots')
                }
                icon={
                  <>
                    <circle cx="12" cy="12" r="9" />
                    <polyline points="12 7 12 12 15 14" />
                  </>
                }
              />
            ) : (
              <div className="grid grid-cols-3 gap-2.5">
                {flow.slots.map((slot) => (
                  <Press
                    key={slot.starts_at}
                    role="button"
                    tabIndex={0}
                    onClick={() => void flow.requestQuote(slot)}
                    className="flex h-12 cursor-pointer items-center justify-center rounded-2xl bg-card text-[14px] font-bold text-card-foreground shadow-soft"
                  >
                    {hhmm(slot.local_start)}
                  </Press>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {(step === 'quote' || step === 'confirming') && quote && (
        <div className="flex flex-col gap-3 pt-2">
          <Row label={t('resource.time')} value={quote.terms.domain.local_start.slice(0, 16).replace('T', ' ')} />
          <Row label={terms.staff?.singular ?? t('resource.staff')} value={quote.terms.domain.trainer_name} />
          {quote.terms.domain.branch_name && (
            <Row label={t('resource.branch')} value={quote.terms.domain.branch_name} />
          )}
          <Row label={t('resource.duration')} value={`${quote.terms.duration_min} ${t('units.min')}`} />
          <Row label={t('resource.price')} value={priceLabel} />
          {quote.next_action !== 'none' && (
            <div className="rounded-2xl bg-muted px-4 py-3 text-[12.5px] text-muted-foreground">
              {t(`resource.next.${quote.next_action}`)}
            </div>
          )}
          <button
            type="button"
            onClick={flow.back}
            className="self-start text-[12.5px] font-bold text-muted-foreground"
          >
            {t('resource.changeTime')}
          </button>
        </div>
      )}

      {step === 'done' && booking && (
        <div className="flex flex-col gap-3 pt-2">
          <Row label={t('resource.status')} value={t(`resource.statusValue.${booking.status}`)} />
          {booking.payment_url && (
            <a
              href={booking.payment_url}
              className="rounded-2xl bg-brand px-4 py-3 text-center text-[14px] font-extrabold text-brand-foreground"
            >
              {t('resource.pay')}
            </a>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[12.5px] font-semibold text-muted-foreground">{label}</span>
      <span className="text-[13.5px] font-bold text-card-foreground">{value}</span>
    </div>
  );
}
