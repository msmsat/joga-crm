// Две отметки записи иконками — «Оплата» и «Посещение». Одни и те же в строке
// записанного (просмотр занятия, компактно) и на итоге мастера записи
// (плиткой с подписью). Сделанное — галочка в уголке, неявка — крестик.
// «Оплата» с долгом в строке записанного — крупная кнопка с суммой к оплате.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../components/Icons';
import type { BookedClient } from '../../../../../api/schedule/schedule.types';
import type { Attendance } from '../../utils';
import { AttendChoice } from './AttendChoice';
import './lessonCard.css';

export type MarkState = 'idle' | 'due' | 'done' | 'missed';

export function VisitMark({ icon, state, label, hint, amount, onClick, disabled, tile, expanded }: {
  icon: React.ReactNode; state: MarkState; label: string; hint: string;
  /** Сумма рядом с иконкой (только не плиткой): кнопка становится крупнее и
   *  сразу называет, сколько принять. */
  amount?: string;
  onClick?: (el: HTMLButtonElement) => void; disabled?: boolean; tile?: boolean;
  /** Кнопка раскрывает выбор: скринридер должен знать, что он есть и открыт ли. */
  expanded?: boolean;
}) {
  const inert = disabled || !onClick;
  const withAmount = amount != null && !tile;
  const name = withAmount ? `${label} · ${hint} · ${amount}` : `${label} · ${hint}`;
  return (
    <button
      type="button"
      className={`lc-mark is-${state}${tile ? ' is-tile' : ''}${withAmount ? ' has-amount' : ''}`}
      title={name}
      aria-label={name}
      aria-pressed={expanded === undefined ? state === 'done' : undefined}
      aria-haspopup={expanded === undefined ? undefined : 'menu'}
      aria-expanded={expanded}
      aria-disabled={inert || undefined}
      onClick={e => { e.stopPropagation(); if (!inert) onClick?.(e.currentTarget); }}
    >
      <span className="lc-mark-icon">
        {icon}
        {(state === 'done' || state === 'missed') && (
          <span key={state} className="lc-mark-badge" aria-hidden>{state === 'done' ? <Icons.Check /> : <Icons.X />}</span>
        )}
      </span>
      {withAmount && <span className="lc-mark-amount">{amount}</span>}
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
 *  абонемент или подарок — галочка «платить нечего». Оплату, принятую у
 *  стойки, галочка открывает (`onReview`): там её можно «Поменять». */
export function PayMark({ client: c, canPay, onPay, onReview, tile, amount }: {
  client: BookedClient; canPay: boolean; onPay: () => void; tile?: boolean;
  /** Открыть уже принятую оплату. Нет — галочка просто показывает способ. */
  onReview?: () => void;
  /** Долг строкой денег — на кнопке рядом с иконкой. Сервер заводит долг уже
   *  по цене этого клиента (его скидки учтены): эту сумму и предложит окно
   *  оплаты. */
  amount?: string;
}) {
  const { t } = useTranslation('journal');
  const label = t('mark.pay');
  if (c.debt > 0) {
    return <VisitMark icon={<Icons.CardIcon />} state="due" label={label} hint={t('mark.unpaid')} amount={amount}
                      onClick={canPay ? onPay : undefined} tile={tile} />;
  }
  if (['import', 'bumpix'].includes(c.booking_channel ?? '') && !c.payment && !c.by_subscription && !(c.paid_amount > 0)) {
    return <VisitMark icon={<Icons.CardIcon />} state="idle" label={label} hint={t('common:records.paymentUnknown')} tile={tile}/>;
  }
  const method = c.payment?.method;
  const hint = c.by_subscription ? t('payment.coveredBy.subscription')
    : c.paid_amount > 0 || c.payment ? (method === 'cash' ? t('mark.cash') : method ? t('mark.card') : t('mark.paid'))
    : t('payment.coveredBy.free');
  return <VisitMark icon={method === 'cash' ? <Icons.CashIcon /> : <Icons.CardIcon />} state="done"
                    label={label} hint={hint} tile={tile} onClick={onReview} />;
}

/** Пришёл ли клиент (utils.attendanceOf). По умолчанию — пришёл: до начала
 *  занятия запись ждёт, и нажатие открывает над кнопкой выбор «Пришёл / Не
 *  пришёл» (предупредил, что не придёт, или явился раньше). С начала занятия
 *  выбирать незачем — нажатие переключает отметку. */
export function AttendMark({ state, started, onSet, tile }: {
  state: Attendance; started: boolean; onSet?: (attended: boolean) => void; tile?: boolean;
}) {
  const { t } = useTranslation('journal');
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const mark: MarkState = state === 'came' ? 'done' : state === 'missed' ? 'missed' : 'idle';
  const hint = state === 'came' ? t('clientCard.status.attended')
    : state === 'missed' ? t('clientCard.status.missed')
    : state === 'unknown' ? t('common:records.attendanceUnknown') : t('mark.waiting');

  const press = (el: HTMLButtonElement) => {
    if (!onSet) return;
    if (started) onSet(state !== 'came');
    else setAnchor(current => (current ? null : el));
  };

  return (
    <>
      <VisitMark icon={<Icons.UserCheck />} state={mark} label={t('mark.attend')} hint={hint}
                 onClick={onSet ? press : undefined} tile={tile}
                 expanded={started || !onSet ? undefined : anchor !== null} />
      {anchor && (
        <AttendChoice
          anchor={anchor}
          current={state}
          onPick={attended => { setAnchor(null); if ((state === 'came') !== attended || state === 'waiting' || state === 'unknown') onSet?.(attended); }}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  );
}
