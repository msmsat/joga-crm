// Записанные на занятие: кто, чем платит, пришёл ли, что сказал о занятии.
// Строка открывает карточку клиента; справа — две отметки иконками: «Оплата»
// (пока есть долг — открывает окно оплаты, оплачено — галочка) и «Посещение»
// (нажали — клиент пришёл, галочка). У группового занятия ещё и снятие с
// занятия; индивидуальную запись отменяют удалением в подвале попапа.
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../components/Icons';
import type { BookedClient } from '../../../../../api/schedule/schedule.types';
import { errorMessage } from '../../../../../api/errorMessage';
import { useToast } from '../../../../../components/ui/index';
import type { useJournalMutations } from '../../hooks/useJournalMutations';
import { ReservationPayModal } from './ReservationPayModal';
import { FundingChips, type Funding } from './FundingChips';
import { AttendMark, PayMark } from './VisitMarks';
import './lessonCard.css';

interface Props {
  clients: BookedClient[];
  canEdit: boolean;
  /** Снять человека с занятия (групповое). У индивидуальной записи — нет. */
  removable: boolean;
  /** Занятие закончилось: неотмеченный приход — уже неявка. */
  over: boolean;
  currency?: string;
  /** Цена занятия — от неё считаются скидки в чипах. */
  price: number;
  lessonLabel: string;
  mutations: ReturnType<typeof useJournalMutations>;
  patch: (fn: (list: BookedClient[]) => BookedClient[]) => void;
  /** Перечитать занятие: после оплаты на брони появляется снимок чека. */
  reload: () => void;
  showToast: (msg: string) => void;
  onPeek: (clientId: number) => void;
  onRemove: (c: BookedClient) => void;
}

/** Каналы, которые стоит назвать: запись самой студией (manual, crm) — норма. */
const CHANNELS = new Set(['online', 'telegram', 'web', 'miniapp']);

const initials = (c: BookedClient) =>
  [c.name, c.last_name].filter(Boolean).map(n => n![0]).join('').toUpperCase();

export function BookedClients({ clients, canEdit, removable, over, currency, price, lessonLabel, mutations, patch, reload, showToast, onPeek, onRemove }: Props) {
  const { t } = useTranslation('journal');
  const toast = useToast();
  // Кому сейчас принимаем оплату.
  const [paying, setPaying] = useState<BookedClient | null>(null);

  const setStatus = (id: number, status: BookedClient['status']) =>
    patch(list => list.map(x => x.reservation_id === id ? { ...x, status } : x));

  const confirm = (c: BookedClient) => {
    mutations.confirmReservation(c.reservation_id)
      .then(() => { setStatus(c.reservation_id, 'active'); showToast(t('toasts.bookingConfirmed')); })
      .catch((e: unknown) => toast.error(errorMessage(e, t)));
  };

  // «Пришёл» — только отметка: об оплате спрашивает своя кнопка рядом.
  const attend = (c: BookedClient) => {
    if (c.status === 'attended') return;
    mutations.attendReservation(c.reservation_id)
      .then(() => { setStatus(c.reservation_id, 'attended'); showToast(t('toasts.attendanceMarked')); })
      .catch((e: unknown) => toast.error(errorMessage(e, t)));
  };

  const paid = (total: number) => {
    if (!paying) return;
    const client = paying;
    setPaying(null);
    patch(list => list.map(x => x.reservation_id === client.reservation_id
      ? { ...x, debt: 0, paid_amount: total } : x));
    showToast(t('toasts.paymentAccepted'));
    reload();
  };

  return (
    <div className="lc-roster">
      <div className="lc-eyebrow">{t('bookingPopup.booked')} · {clients.length}</div>
      <div className="lc-roster-list">
        {clients.map(c => (
          <div
            key={c.reservation_id}
            className={`lc-person${c.status === 'attended' ? ' is-attended' : ''}`}
            role="button"
            tabIndex={0}
            title={t('bookingPopup.openClient')}
            onClick={e => { e.stopPropagation(); onPeek(c.client_id); }}
            onKeyDown={e => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault(); e.stopPropagation();
              onPeek(c.client_id);
            }}
          >
            <span className="lc-avatar" style={{ background: c.avatar_color ?? 'var(--peach)' }}>{initials(c)}</span>
            <div className="lc-person-main">
              <div className="lc-person-name">{c.name} {c.last_name ?? ''}</div>
              {/* Чем записан и чем закрыт: абонемент, скидки, баллы, сертификат,
                  оплачено или долг — строкой чипов, как на чеке. */}
              <FundingChips funding={fundingOf(c, price)} currency={currency} />
              <div className="lc-badges">
                {c.status === 'pending' && <span className="lc-badge is-peach">{t('bookingPopup.awaitingConfirmation')}</span>}
                {c.rating != null && <span className="lc-badge is-star">★ {c.rating}</span>}
                {c.coffee && <span className="lc-badge">{t('lessonCard.coffee')}</span>}
                {c.booking_channel && CHANNELS.has(c.booking_channel) && (
                  <span className="lc-badge is-quiet">{t(`lessonCard.channel.${c.booking_channel}`)}</span>
                )}
              </div>
              {c.review_text && <div className="lc-review">«{c.review_text}»</div>}
            </div>

            <div className="lc-person-actions">
              {c.status === 'pending' ? (
                canEdit && (
                  <button type="button" className="lc-act is-peach" title={t('bookingPopup.confirmBooking')}
                          aria-label={t('bookingPopup.confirmBooking')}
                          onClick={e => { e.stopPropagation(); confirm(c); }}>
                    <Icons.Check />
                  </button>
                )
              ) : (
                <>
                  <PayMark client={c} canPay={canEdit} onPay={() => setPaying(c)} />
                  <AttendMark attended={c.status === 'attended'} missed={over} onAttend={() => attend(c)} />
                </>
              )}
              {canEdit && (removable || c.status === 'pending') && (
                <button type="button" className="lc-act is-quiet"
                        title={c.status === 'pending' ? t('bookingPopup.rejectBooking') : t('bookingPopup.removeFromLesson')}
                        aria-label={c.status === 'pending' ? t('bookingPopup.rejectBooking') : t('bookingPopup.removeFromLesson')}
                        onClick={e => { e.stopPropagation(); onRemove(c); }}>
                  <Icons.X />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {paying && (
        // Обёртка гасит всплытие React-событий из портала окна: иначе клик в
        // нём дошёл бы до строки клиента и сетки под попапом.
        <div onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
          <ReservationPayModal
            booked={paying}
            lessonLabel={lessonLabel}
            mutations={mutations}
            onPaid={paid}
            onClose={() => setPaying(null)}
          />
        </div>
      )}
    </div>
  );
}

/** Строка записанного → общий вид «как записан и чем закрыт». */
const fundingOf = (c: BookedClient, price: number): Funding => ({
  price,
  trialPercent: c.trial_discount_percent ?? null,
  manualPercent: c.manual_discount_percent ?? null,
  isTrial: c.is_trial,
  subscriptionName: c.subscription_name ?? null,
  bySubscription: c.by_subscription,
  debt: c.debt,
  paidAmount: c.paid_amount ?? 0,
  payment: c.payment ?? null,
});
