// Оплата, уже принятая у стойки, — тем же окном, что и приём оплаты (PaySheet):
// слева — что выбрали (способ, баллы, депозит, ваучер, промокод), справа — чек
// таким, каким его провела касса. Внизу «Поменять»: после подтверждения оплата
// отменяется (доход уходит из Финансов возвратом, баллы, депозит, сертификат и
// разовые скидки возвращаются клиенту, долг снова открыт), а окно сменяется
// обычным окном оплаты — выбрать заново (BookedClients).
// На телефоне колонки складываются в одну, окно — шит снизу (ModalShell).
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BookedClient, PaymentBreakdown } from '../../../../../api/schedule/schedule.types';
import { errorMessage } from '../../../../../api/errorMessage';
import {
  Button, ConfirmModal, Dialog, GhostButton, ModalBody, ModalFooter, ModalHeader, useModalClose, useToast,
} from '../../../../../components/ui/index';
import * as Icons from '../../../../../components/Icons';
import { formatMoney } from '../../../../../lib/money';
import type { useJournalMutations } from '../../hooks/useJournalMutations';
import { PAY_SHEET_FLOOR } from './PaySheet';
import { Line } from './PayTiles';
import './lessonCard.css';
import './paidSheet.css';

interface Props {
  booked: BookedClient;
  /** Снимок кассы — чем оплачено (`booked.payment`, уже проверенный). */
  payment: PaymentBreakdown;
  lessonLabel: string;
  currency?: string;
  mutations: Pick<ReturnType<typeof useJournalMutations>, 'cancelPayment'>;
  /** Оплата отменена, окно доиграло уход — дальше выбирают заново. */
  onChanged: () => void;
  onClose: () => void;
}

export function PaidSheet({ booked, payment, lessonLabel, currency, mutations, onChanged, onClose }: Props) {
  const { t, i18n } = useTranslation(['journal', 'common']);
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  // Отмена прошла: окно уходит, когда доиграет уход подтверждение над ним.
  const [changed, setChanged] = useState(false);
  const money = (value: number) => formatMoney(value, currency);
  const name = [booked.name, booked.last_name].filter(Boolean).join(' ');
  const cash = payment.method === 'cash';

  const change = () => mutations.cancelPayment(booked.reservation_id)
    .then(() => setChanged(true))
    .catch((e: unknown) => {
      toast.error(errorMessage(e, t));
      // Подтверждение остаётся открытым: решение за человеком — повторить или нет.
      throw e;
    });

  return (
    <Dialog onClose={changed ? onChanged : onClose} zIndex={PAY_SHEET_FLOOR} maxWidth="760px"
            dismissible={!asking}>
      <CloseWhen when={changed && !asking} />
      <ModalHeader title={t('journal:lessonPay.title')} subtitle={`${name} · ${lessonLabel}`} />
      <ModalBody>
        <div className="rp-grid">
          <section className="rp-col">
            <div className="lc-eyebrow">{t('journal:paidSheet.chosen')}</div>
            <div className="rp-tile is-on ps-method">
              <span className="ps-method-icon" aria-hidden>{cash ? <Icons.CashIcon /> : <Icons.CardIcon />}</span>
              <div className="ps-method-text">
                <span className="rp-tile-title">{t('journal:lessonPay.method')}</span>
                <span className="ps-method-name">{cash ? t('journal:mark.cash') : t('journal:mark.card')}</span>
              </div>
            </div>
            <Extras payment={payment} money={money} />
            {(payment.paid_at || booked.auto_paid) && (
              <div className="rp-note">
                {[
                  payment.paid_at && t('journal:paidSheet.paidAt', { date: paidAt(payment.paid_at, i18n.language) }),
                  booked.auto_paid && t('journal:paidSheet.bySystem'),
                ].filter(Boolean).join(' · ')}
              </div>
            )}
            <div className="rp-note rp-note-soft">{t('journal:paidSheet.changeHint')}</div>
          </section>

          <section className="rp-col rp-receipt">
            <div className="lc-eyebrow">{t('journal:lessonPay.receipt')}</div>
            <Line label={t('journal:lessonPay.price')} value={money(payment.base_price)} />
            {payment.discounts.map(d => (
              <Line key={d.kind} tone="gain" value={`−${money(d.amount)}`}
                    label={d.kind === 'promo' && payment.promo_code
                      ? `${t('journal:payment.discount.promo')} ${payment.promo_code}`
                      : t(`journal:payment.discount.${d.kind}`)} />
            ))}
            {payment.certificate_applied > 0 && (
              <Line label={t('journal:payment.voucher')} value={`−${money(payment.certificate_applied)}`} tone="gain" />
            )}
            {payment.bonuses_value > 0 && (
              <Line label={t('journal:lessonPay.pointsLine', { points: payment.bonuses_applied })}
                    value={`−${money(payment.bonuses_value)}`} tone="gain" />
            )}
            {payment.deposit_applied > 0 && (
              <Line label={t('journal:lessonPay.deposit')} value={`−${money(payment.deposit_applied)}`} tone="gain" />
            )}
            <div className="rp-total">
              <span>{t('journal:mark.paid')}</span>
              <strong>{money(payment.total)}</strong>
            </div>
          </section>
        </div>
      </ModalBody>
      <ModalFooter>
        <div className="rp-foot">
          <GhostButton>{t('common:buttons.close')}</GhostButton>
          <div className="rp-methods">
            <Button fullWidth icon={<Icons.Edit />} disabled={changed} onClick={() => setAsking(true)}>
              {t('journal:paidSheet.change')}
            </Button>
          </div>
        </div>
      </ModalFooter>

      {asking && (
        <ConfirmModal
          title={t('journal:paidSheet.confirmTitle')}
          message={t('journal:paidSheet.confirmMessage', { amount: money(payment.total) })}
          confirmText={t('journal:paidSheet.confirm')}
          cancelText={t('journal:paidSheet.keep')}
          onConfirm={change}
          onClose={() => setAsking(false)}
        />
      )}
    </Dialog>
  );
}

/** Чем клиент расплатился помимо денег — плитками, как выключатели в окне
 *  оплаты, но уже без выбора. Ничего не было — так и сказано. */
function Extras({ payment, money }: { payment: PaymentBreakdown; money: (value: number) => string }) {
  const { t } = useTranslation('journal');
  const tiles = [
    payment.bonuses_applied > 0 && {
      key: 'points', title: t('lessonPay.points'),
      value: t('lessonPay.pointsValue', { points: payment.bonuses_applied, amount: money(payment.bonuses_value) }),
    },
    payment.deposit_applied > 0 && { key: 'deposit', title: t('lessonPay.deposit'), value: money(payment.deposit_applied) },
    payment.certificate_applied > 0 && {
      key: 'voucher', title: t('payment.voucher'),
      value: [payment.certificate_code, money(payment.certificate_applied)].filter(Boolean).join(' · '),
    },
    payment.promo_code && { key: 'promo', title: t('payment.promo'), value: payment.promo_code },
  ].filter((tile): tile is { key: string; title: string; value: string } => !!tile);

  if (tiles.length === 0) return <div className="rp-tile ps-plain">{t('paidSheet.noExtras')}</div>;
  return (
    <>
      {tiles.map(tile => (
        <div key={tile.key} className="rp-tile is-on">
          <div className="rp-tile-head">
            <span className="rp-tile-title">{tile.title}</span>
            <span className="rp-tile-value">{tile.value}</span>
          </div>
        </div>
      ))}
    </>
  );
}

/** Закрыть окно его же анимацией ухода (ModalShell), когда дело сделано. */
function CloseWhen({ when }: { when: boolean }) {
  const close = useModalClose();
  useEffect(() => { if (when) close(); }, [when, close]);
  return null;
}

/** Снимок пишет время кассы в UTC без зоны — читаем его как UTC. */
const paidAt = (iso: string, lang: string) =>
  new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`));
