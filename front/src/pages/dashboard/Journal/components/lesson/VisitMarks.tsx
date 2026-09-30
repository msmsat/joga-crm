// Две отметки записи иконками — «Оплата» и «Посещение». Одни и те же в строке
// записанного (просмотр занятия, компактно) и на итоге мастера записи
// (плиткой с подписью). Сделанное — галочка в уголке, неявка — крестик.
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../components/Icons';
import type { BookedClient } from '../../../../../api/schedule/schedule.types';
import './lessonCard.css';

export type MarkState = 'idle' | 'due' | 'done' | 'missed';

export function VisitMark({ icon, state, label, hint, onClick, disabled, tile }: {
  icon: React.ReactNode; state: MarkState; label: string; hint: string;
  onClick?: () => void; disabled?: boolean; tile?: boolean;
}) {
  const inert = disabled || !onClick;
  return (
    <button
      type="button"
      className={`lc-mark is-${state}${tile ? ' is-tile' : ''}`}
      title={`${label} · ${hint}`}
      aria-label={`${label} · ${hint}`}
      aria-pressed={state === 'done'}
      aria-disabled={inert || undefined}
      onClick={e => { e.stopPropagation(); if (!inert) onClick?.(); }}
    >
      <span className="lc-mark-icon">
        {icon}
        {(state === 'done' || state === 'missed') && (
          <span className="lc-mark-badge" aria-hidden>{state === 'done' ? <Icons.Check /> : <Icons.X />}</span>
        )}
      </span>
      {tile && (
        <span className="lc-mark-text">
          <span className="lc-mark-label">{label}</span>
          <span className="lc-mark-hint">{hint}</span>
        </span>
      )}
    </button>
  );
}

/** Как оплачена бронь: долг — «Оплатить», оплачено — галочка со способом,
 *  абонемент или подарок — галочка «платить нечего». */
export function PayMark({ client: c, canPay, onPay, tile }: {
  client: BookedClient; canPay: boolean; onPay: () => void; tile?: boolean;
}) {
  const { t } = useTranslation('journal');
  const label = t('mark.pay');
  if (c.debt > 0) {
    return <VisitMark icon={<Icons.CardIcon />} state="due" label={label} hint={t('mark.unpaid')}
                      onClick={canPay ? onPay : undefined} tile={tile} />;
  }
  const method = c.payment?.method;
  const hint = c.by_subscription ? t('payment.coveredBy.subscription')
    : c.paid_amount > 0 || c.payment ? (method === 'cash' ? t('mark.cash') : method ? t('mark.card') : t('mark.paid'))
    : t('payment.coveredBy.free');
  return <VisitMark icon={method === 'cash' ? <Icons.CashIcon /> : <Icons.CardIcon />} state="done"
                    label={label} hint={hint} tile={tile} />;
}

/** Пришёл ли клиент. Не отметили, а занятие закончилось, — неявка: крестик,
 *  но отметить приход задним числом по-прежнему можно. */
export function AttendMark({ attended, missed, onAttend, tile }: {
  attended: boolean; missed: boolean; onAttend?: () => void; tile?: boolean;
}) {
  const { t } = useTranslation('journal');
  const state: MarkState = attended ? 'done' : missed ? 'missed' : 'idle';
  const hint = attended ? t('bookingPopup.attended') : missed ? t('clientCard.status.missed') : t('mark.notMarked');
  return <VisitMark icon={<Icons.UserCheck />} state={state} label={t('mark.attend')} hint={hint}
                    onClick={attended ? undefined : onAttend} tile={tile} />;
}
