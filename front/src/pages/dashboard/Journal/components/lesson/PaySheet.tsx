// Окно оплаты занятия у стойки — одно на две двери: «Оплата» в просмотре записи
// (долг уже есть) и «Оплата» на итоге мастера записи (запись ещё не создана,
// деньги примутся при подтверждении). Слева — чем клиент может сэкономить
// (уровень, первое занятие, баллы, депозит, приглашения, своя скидка,
// промокод, ваучер), справа — чек. Внизу две кнопки способа: наличными или
// картой. Считает сервер (usePaymentCheck), здесь только выбор.
// На телефоне колонки складываются в одну, окно — шит снизу (ModalShell).
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { clientsApi } from '../../../../../api/clients/clients.api';
import { queryKeys } from '../../../../../api/queryKeys';
import { Button, Dialog, GhostButton, ModalBody, ModalFooter, ModalHeader, useModalClose } from '../../../../../components/ui/index';
import * as Icons from '../../../../../components/Icons';
import { formatMoney } from '../../../../../lib/money';
import { useStudioCurrency } from '../../../../../hooks/useStudioCurrency';
import type { PaymentCheck } from '../../hooks/usePaymentCheck';
import { FirstLessonTile, PaymentCodes } from './PaymentCodes';
import { BalanceTile, FailedNote, Line, ManualDiscount, ReferralTile } from './PayTiles';
import './lessonCard.css';

/** Выше попапа журнала (9000) и карточки клиента (9500). Тот же этаж у окна
 *  уже принятой оплаты (PaidSheet). */
export const PAY_SHEET_FLOOR = 9600;

/** Наличные или карта у стойки (терминал, перевод) — `transfer` на сервере. */
export type PayMethod = 'cash' | 'transfer';

interface Props {
  payment: PaymentCheck;
  clientId: number;
  title: string;
  subtitle: string;
  /** Итог записи: способ только выбирается, деньги примутся при подтверждении. */
  deferred?: boolean;
  /** Способ, выбранный раньше (итог записи) — его кнопка отмечена. */
  chosen?: PayMethod | null;
  sending?: boolean;
  /** Деньги приняты — окно уходит своей анимацией и только потом зовёт onClose. */
  done?: boolean;
  onPay: (method: PayMethod) => void;
  /** Левая кнопка подвала: «Отмена» или «Не оплачивать сейчас». */
  cancelLabel: string;
  onCancel?: () => void;
  onClose: () => void;
}

export function PaySheet({ payment, clientId, title, subtitle, deferred, chosen, sending = false, done = false, onPay, cancelLabel, onCancel, onClose }: Props) {
  const { t } = useTranslation(['journal', 'common']);
  const { data: profile } = useQuery({
    queryKey: queryKeys.client(clientId),
    queryFn: () => clientsApi.getProfile(clientId),
  });
  const studioCurrency = useStudioCurrency();
  const { preview } = payment;
  const money = (value: number) => formatMoney(value, preview?.currency ?? studioCurrency);
  const nothingToPay = preview != null && preview.total <= 0;

  return (
    <Dialog onClose={onClose} zIndex={PAY_SHEET_FLOOR} maxWidth="760px">
      <CloseWhen when={done} />
      <ModalHeader title={title} subtitle={subtitle} />
      <ModalBody>
        <div className="rp-grid">
          <section className="rp-col">
            <div className="lc-eyebrow">{t('journal:lessonPay.benefits')}</div>
            {profile?.loyalty_level && (
              <div className="rp-level" style={{ ['--lvl' as string]: profile.loyalty_level.color }}>
                <span className="rp-level-dot" />
                <span className="rp-level-name">{profile.loyalty_level.name}</span>
                {profile.loyalty_level.next_name && profile.loyalty_level.to_next != null && (
                  <span className="rp-level-next">
                    {t('journal:lessonPay.toNext', { amount: money(profile.loyalty_level.to_next), level: profile.loyalty_level.next_name })}
                  </span>
                )}
              </div>
            )}
            <FirstLessonTile payment={payment} disabled={sending} />
            <BalanceTile
              title={t('journal:lessonPay.points')}
              value={preview ? t('journal:lessonPay.pointsValue', { points: preview.bonuses_available, amount: money(preview.bonuses_available * preview.point_value) }) : '—'}
              switchLabel={t('journal:lessonPay.usePoints')}
              checked={payment.useBonuses}
              disabled={!preview || preview.bonuses_available <= 0 || sending}
              onChange={payment.setUseBonuses}
            />
            <BalanceTile
              title={t('journal:lessonPay.deposit')}
              value={preview ? money(preview.deposit_available) : '—'}
              switchLabel={t('journal:lessonPay.useDeposit')}
              checked={payment.useDeposit}
              disabled={!preview || preview.deposit_available <= 0 || sending}
              onChange={payment.setUseDeposit}
            />
            {preview?.referral && <ReferralTile referral={preview.referral} money={money} />}
            {preview?.cashback_percent != null && (
              <div className="rp-note rp-note-soft">
                {t('journal:lessonPay.cashbackRule', { percent: preview.cashback_percent })}
              </div>
            )}
            <ManualDiscount payment={payment} disabled={sending} />
            <PaymentCodes payment={payment} disabled={sending} money={money} />
          </section>

          <section className="rp-col rp-receipt" aria-busy={payment.loading}>
            <div className="lc-eyebrow">{t('journal:lessonPay.receipt')}</div>
            {!preview ? (
              payment.failed
                ? <FailedNote onRetry={payment.retry} />
                : <div className="rp-skeleton" />
            ) : (
              <>
                <Line label={t('journal:lessonPay.price')} value={money(preview.base_price)} />
                {preview.discounts.map(d => (
                  <Line key={d.kind} label={d.name || t(`journal:payment.discount.${d.kind}`)} value={`−${money(d.amount)}`} tone="gain" />
                ))}
                {preview.manual_outweighed && (
                  <div className="rp-note">{t('journal:payment.promoOutweighed')}</div>
                )}
                {preview.certificate_applied > 0 && (
                  <Line label={t('journal:payment.voucher')} value={`−${money(preview.certificate_applied)}`} tone="gain" />
                )}
                {preview.bonuses_value > 0 && (
                  <Line label={t('journal:lessonPay.pointsLine', { points: preview.bonuses_applied })}
                        value={`−${money(preview.bonuses_value)}`} tone="gain" />
                )}
                {preview.deposit_applied > 0 && (
                  <Line label={t('journal:lessonPay.deposit')} value={`−${money(preview.deposit_applied)}`} tone="gain" />
                )}
                {payment.failed && <FailedNote onRetry={payment.retry} />}
                <div className="rp-total">
                  <span>{t('journal:lessonPay.total')}</span>
                  {/* key — новое число проявляется (rp-num), а не подменяется. */}
                  <strong key={preview.total} className="rp-total-num">{money(preview.total)}</strong>
                </div>
                {preview.points_to_earn > 0 && (
                  <div className="rp-earn">{t('journal:lessonPay.willEarn', { points: preview.points_to_earn })}</div>
                )}
                {deferred && <div className="rp-note rp-note-soft">{t('journal:lessonPay.deferred')}</div>}
              </>
            )}
          </section>
        </div>
      </ModalBody>
      <ModalFooter>
        <div className="rp-foot">
          <GhostButton onClick={onCancel}>{cancelLabel}</GhostButton>
          {/* Платить нечего (абонемент, скидка на всю сумму, баллы) — одна
              кнопка: способ ни на что не влияет. */}
          {nothingToPay ? (
            <div className="rp-methods">
              <Button fullWidth onClick={() => onPay('cash')} disabled={!payment.ready} loading={sending}>
                {t('journal:lessonPay.close')}
              </Button>
            </div>
          ) : (
            <div className="rp-methods">
              <MethodButton method="transfer" chosen={chosen} disabled={!payment.ready} sending={sending} onPay={onPay}
                            label={t('journal:lessonPay.byCard', { amount: preview ? money(preview.total) : '' })} />
              <MethodButton method="cash" chosen={chosen} disabled={!payment.ready} sending={sending} onPay={onPay}
                            label={t('journal:lessonPay.byCash', { amount: preview ? money(preview.total) : '' })} />
            </div>
          )}
        </div>
      </ModalFooter>
    </Dialog>
  );
}

/** Закрыть окно его же анимацией ухода (ModalShell), когда дело сделано. */
function CloseWhen({ when }: { when: boolean }) {
  const close = useModalClose();
  useEffect(() => { if (when) close(); }, [when, close]);
  return null;
}

function MethodButton({ method, chosen, disabled, sending, onPay, label }: {
  method: PayMethod; chosen?: PayMethod | null; disabled: boolean; sending: boolean;
  onPay: (method: PayMethod) => void; label: string;
}) {
  // Наличные — главная кнопка (чаще всего у стойки), карта — вторая. На итоге
  // записи главной становится уже выбранная.
  const primary = chosen ? chosen === method : method === 'cash';
  return (
    <Button fullWidth variant={primary ? 'primary' : 'dark'} disabled={disabled} loading={sending && primary}
            icon={method === 'cash' ? <Icons.CashIcon /> : <Icons.CardIcon />} onClick={() => onPay(method)}>
      {label}
    </Button>
  );
}
