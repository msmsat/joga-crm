import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlanType } from '../../types';
import { formatMoney } from '../../../../../lib/money';
import { InfoIcon } from '../ui/BillingIcons';
import { ModalShell, ModalHeader, ModalBody, ModalFooter, GhostButton, PrimaryButton, ConfirmModal } from '../../../../../components/ui/index';

interface Props {
  currency?: string;
  selectedPlan: PlanType;
  selectedPeriod: number;
  periodDiscounts: Record<number, number>;
  plans: Record<PlanType, { name: string; monthly: number; color: string }>;
  getPrice: (plan: PlanType, period: number) => number;
  savedTotal: number;
  totalToPay: number;
  onClose: () => void;
  startCheckout: () => void;
  /** Апгрейд с начала следующего периода: платить сейчас не нужно. */
  scheduleUpgrade: () => void;
  /** Есть ли что «доигрывать» — живая оплаченная подписка. Без неё выбора нет:
   *  первый тариф откладывать не с чего, он начинается сразу. */
  hasLiveSubscription: boolean;
  /** Конец оплаченного периода — дата, с которой начнётся новый тариф. */
  currentPeriodEnd?: string | null;
  /** Ставка НДС для подписи, % — приходит каталогом с бэка (BILLING_VAT_RATE). */
  vatRate: number;
  /** Сохранённая страна студии. Пусто — ставку показывать не из чего: её задаёт
   *  страна плательщика, и до её ввода любое число здесь было бы выдумкой. */
  country: string;
}

export default function UpgradeModal({ currency, selectedPlan, selectedPeriod, periodDiscounts, plans, getPrice, savedTotal, totalToPay, onClose, startCheckout, scheduleUpgrade, hasLiveSubscription, currentPeriodEnd, vatRate, country }: Props) {
  const { t } = useTranslation('billing');
  const plan = plans[selectedPlan];
  // Налог показываем ТОЛЬКО когда известна страна: ставку определяет она, и до её
  // ввода «≈ 47.19» было бы обещанием, которого никто не давал — у студии из другой
  // страны ЕС с номером НДС это вовсе 0 % (reverse charge). Пока страны нет, в итоге
  // стоит цена каталога с честной подписью «без НДС»; страна спрашивается на шаге
  // реквизитов перед оплатой, и тогда строка налога появляется.
  const showVat = country.trim().length > 0;
  // Ориентир для подписи, а не расчёт к оплате: итог считает Stripe Tax.
  const vatAmount = Math.round(totalToPay * vatRate) / 100;
  const totalWithVat = Math.round(totalToPay * (100 + vatRate)) / 100;
  // «Перейти сейчас» сжигает остаток оплаченного периода без возврата, поэтому
  // подтверждается отдельно. Спокойный путь (с начала периода) — основная кнопка.
  const [confirmNow, setConfirmNow] = useState(false);
  const periodEndLabel = currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString() : '';
  const subtitle = t('upgrade.priceLine', { price: formatMoney(getPrice(selectedPlan, selectedPeriod), currency) })
    + (selectedPeriod > 1 ? t('upgrade.discountNote', { percent: periodDiscounts[selectedPeriod] * 100, period: selectedPeriod }) : '');

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title={t('upgrade.title', { plan: plan.name })} subtitle={subtitle} />
      <ModalBody>
        <div style={{ padding: '16px 20px', background: 'rgba(252,174,145,0.06)', borderRadius: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{t('upgrade.planLabel')}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)' }}>{plan.name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{t('upgrade.periodLabel')}</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--onyx)' }}>
              {t('upgrade.periodValue', { count: selectedPeriod })}
            </span>
          </div>
          {selectedPeriod > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{t('upgrade.discountLabel')}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--pistachio)' }}>
                −{periodDiscounts[selectedPeriod] * 100}% (−{formatMoney(savedTotal, currency)})
              </span>
            </div>
          )}
          {/* Цены каталога — БЕЗ налога (tax_behavior=exclusive на стороне Stripe),
              поэтому налог идёт отдельной строкой и только здесь, на шаге оплаты.
              Сумма ориентировочная: настоящую ставку считает Stripe Tax по стране
              студии и её статусу плательщика — у компании из другой страны ЕС с
              валидным номером НДС это 0 % (reverse charge). Поэтому «≈» и подпись,
              что итог будет на странице оплаты. */}
          {showVat && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                {t('upgrade.vatLabel', { rate: vatRate })}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--muted)' }}>
                ≈ {formatMoney(vatAmount, currency)}
              </span>
            </div>
          )}
          <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--onyx)' }}>
              {showVat ? t('upgrade.totalWithVatLabel') : t('upgrade.totalNetLabel')}
            </span>
            <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--onyx)' }}>
              {showVat ? `≈ ${formatMoney(totalWithVat, currency)}` : formatMoney(totalToPay, currency)}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.45, marginTop: '8px' }}>
            {showVat ? t('upgrade.vatNote', { rate: vatRate }) : t('upgrade.vatUnknownNote')}
          </div>
        </div>

        {/* Когда есть оплаченный период — объясняем, что по умолчанию он доигрывает
            целиком, а не сгорает. Без подписки выбора нет: тариф начинается сразу. */}
        {hasLiveSubscription && (
          <div style={{ padding: '12px 16px', background: 'rgba(163,201,168,0.1)', border: '1px solid rgba(163,201,168,0.25)', borderRadius: '12px', fontSize: '12px', color: 'var(--muted)', lineHeight: '1.6' }}>
            {periodEndLabel
              ? t('upgrade.startsAtNote', { date: periodEndLabel })
              : t('upgrade.startsAtNoteNoDate')}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <InfoIcon />
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('upgrade.trustNote')}</span>
        </div>
      </ModalBody>
      <ModalFooter>
        {hasLiveSubscription ? (
          <>
            <GhostButton onClick={() => setConfirmNow(true)}>{t('upgrade.switchNow')}</GhostButton>
            <PrimaryButton onClick={() => { onClose(); scheduleUpgrade(); }}>
              {t('upgrade.confirmScheduled')}
            </PrimaryButton>
          </>
        ) : (
          <>
            <GhostButton>{t('common:cancel')}</GhostButton>
            <PrimaryButton onClick={() => { onClose(); startCheckout(); }}>
              {t('upgrade.confirmAndPay')}
            </PrimaryButton>
          </>
        )}
      </ModalFooter>

      {confirmNow && (
        <ConfirmModal
          danger
          title={t('upgrade.switchNowTitle')}
          message={periodEndLabel
            ? t('upgrade.switchNowWarning', { date: periodEndLabel })
            : t('upgrade.switchNowWarningNoDate')}
          confirmText={t('upgrade.switchNowConfirm')}
          onConfirm={() => { setConfirmNow(false); onClose(); startCheckout(); }}
          onClose={() => setConfirmNow(false)}
        />
      )}
    </ModalShell>
  );
}
