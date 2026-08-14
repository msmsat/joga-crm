import { useTranslation } from 'react-i18next';
import type { PlanType } from '../../types';
import type { CheckoutPreview, BillingProfile } from '../../../../../api/billing/billing.types';
import { formatMoney } from '../../../../../lib/money';
import { InfoIcon } from '../ui/BillingIcons';
import { ModalShell, ModalHeader, ModalBody, ModalFooter, PrimaryButton } from '../../../../../components/ui/index';

interface Props {
  currency?: string;
  selectedPlan: PlanType;
  selectedPeriod: number;
  periodDiscounts: Record<number, number>;
  plans: Record<PlanType, { name: string; monthly: number; color: string }>;
  getPrice: (plan: PlanType, period: number) => number;
  savedTotal: number;
  /** Локальный итог по каталогу — показывается, пока не приехал расчёт сервера. */
  totalToPay: number;
  /** Расчёт перехода с сервера: зачёт остатка, итог, что сгорит. null — ещё едет. */
  preview: CheckoutPreview | null;
  previewBusy: boolean;
  payBusy: boolean;
  onClose: () => void;
  /** Единственное действие модалки: уводит на страницу Stripe. */
  onPay: () => void;
  /** Реквизиты, которыми выпишется фактура. Заполнены всегда: без них сюда не пускает гейт. */
  profile: BillingProfile | null;
  /** Правка реквизитов прямо отсюда. Ссылкой, не кнопкой: кнопка внизу одна. */
  onEditProfile: () => void;
}

const Row = ({ label, value, muted, accent }: {
  label: string; value: string; muted?: boolean; accent?: string;
}) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '8px' }}>
    <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{label}</span>
    <span style={{ fontSize: '13px', fontWeight: 700, color: accent ?? (muted ? 'var(--muted)' : 'var(--onyx)'), textAlign: 'right' }}>
      {value}
    </span>
  </div>
);

/**
 * Единственный экран между «Оплатить» и страницей Stripe. Выбора способа оплаты
 * тут нет — платят картой, и кнопка уводит прямо на Stripe. Реквизиты плательщика
 * собраны раньше (гейт перед этой модалкой) и показаны здесь строкой: увидеть
 * чужой адрес надо ДО списания, потому что выпущенный счёт уже не пересчитать.
 *
 * Показывает ровно то, что спишется, и берёт цифры у сервера (`preview`), а не
 * считает сам: зачёт остатка вычисляет Stripe тем же вызовом, которым потом
 * выставит счёт. Своя формула однажды разошлась бы с реально списанным.
 */
export default function PayModal({
  currency, selectedPlan, selectedPeriod, periodDiscounts, plans, getPrice,
  savedTotal, totalToPay, preview, previewBusy, payBusy, onClose, onPay,
  profile, onEditProfile,
}: Props) {
  const { t, i18n } = useTranslation('billing');
  const plan = plans[selectedPlan];
  const money = (cents: number) => formatMoney(cents / 100, currency);

  // Бесплатный старт: до этой даты подписка не списывает — там ещё лежит уже
  // оплаченный остаток. Число дней считает сервер (теми же часами, которыми
  // выбрана дата), здесь только форматирование.
  const freeDays = preview?.free_days || 0;
  const freeUntil = preview?.free_until
    ? new Date(preview.free_until).toLocaleDateString(i18n.language === 'ru' ? 'ru-RU' : 'en-US', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : null;

  const kind = preview?.kind ?? 'new';
  // Пока расчёт едет, показываем каталожную цену — она верна для первой покупки и
  // для продления, а при смене тарифа только завышена (зачёт её уменьшит).
  const gross = preview ? preview.gross : Math.round(totalToPay * 100);
  const credit = preview?.credit ?? 0;
  const total = preview ? preview.total : Math.round(totalToPay * 100);
  const burned = preview?.burned ?? 0;
  // Имя тарифа, остаток которого зачитывается. Незнакомый id (легаси-план) выводим
  // как есть — строка зачёта важнее красивого названия.
  const currentName = preview?.current_plan
    ? plans[preview.current_plan as PlanType]?.name ?? preview.current_plan
    : '';

  const title = kind === 'renewal'
    ? t('payModal.titleRenew', { plan: plan.name })
    : kind === 'switch'
    ? t('payModal.titleSwitch', { plan: plan.name })
    : t('payModal.titleNew', { plan: plan.name });

  const subtitle = t('upgrade.priceLine', { price: formatMoney(getPrice(selectedPlan, selectedPeriod), currency) })
    + (selectedPeriod > 1 ? t('upgrade.discountNote', { percent: periodDiscounts[selectedPeriod] * 100, period: selectedPeriod }) : '');

  return (
    <ModalShell onClose={onClose}>
      <ModalHeader title={title} subtitle={subtitle} />
      <ModalBody>
        <div style={{ padding: '16px 20px', background: 'rgba(252,174,145,0.06)', borderRadius: '14px' }}>
          <Row label={t('upgrade.planLabel')} value={plan.name} />
          <Row label={t('upgrade.periodLabel')} value={t('upgrade.periodValue', { count: selectedPeriod })} />
          {selectedPeriod > 1 && (
            <Row
              label={t('upgrade.discountLabel')}
              value={`−${periodDiscounts[selectedPeriod] * 100}% (−${formatMoney(savedTotal, currency)})`}
              accent="var(--pistachio)"
            />
          )}

          <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }} />

          {/* Строка зачёта появляется только при смене тарифа. «Ваш тариф» — это
              неиспользованный остаток текущего периода, который Stripe считает по
              секундам и вычитает из нового счёта. */}
          {credit > 0 && (
            <>
              <Row label={t('payModal.grossLabel')} value={money(gross)} />
              <Row
                label={t('payModal.creditLabel', { plan: currentName })}
                value={`−${money(credit)}`}
                accent="var(--pistachio)"
              />
              <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }} />
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'baseline' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--onyx)' }}>
              {t('payModal.totalLabel')}
            </span>
            <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--onyx)', opacity: previewBusy ? 0.45 : 1, transition: 'opacity .2s' }}>
              {money(total)}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.45, marginTop: '8px' }}>
            {t('upgrade.vatNote')}
          </div>
        </div>

        {/* Остаток больше стоимости нового тарифа: доплачивать нечего, но разница
            НЕ переносится. Предупреждаем до оплаты — после неё возврата нет. */}
        {burned > 0 && (
          <div style={{ padding: '12px 16px', background: 'rgba(216,140,154,0.1)', border: '1px solid rgba(216,140,154,0.3)', borderRadius: '12px', fontSize: '12px', color: 'var(--onyx)', lineHeight: '1.6' }}>
            {t('payModal.burnWarning', { amount: money(burned) })}
          </div>
        )}

        {/* Уже оплаченный остаток (триал или прежний период) не сгорает: подписка
            стартует бесплатно до его конца и только потом начинает списывать.
            Без этой строки сумма читалась как «спишут сегодня», и владелец видел
            в ней вторую оплату за месяц, который уже оплатил. */}
        {freeDays > 0 && freeUntil && (
          <div style={{ padding: '12px 16px', background: 'rgba(163,201,168,0.1)', border: '1px solid rgba(163,201,168,0.25)', borderRadius: '12px', fontSize: '12px', color: 'var(--onyx)', lineHeight: '1.6' }}>
            {t('payModal.freeUntil', { count: freeDays, date: freeUntil })}
          </div>
        )}

        {kind === 'renewal' && (
          <div style={{ padding: '12px 16px', background: 'rgba(163,201,168,0.1)', border: '1px solid rgba(163,201,168,0.25)', borderRadius: '12px', fontSize: '12px', color: 'var(--muted)', lineHeight: '1.6' }}>
            {t('payModal.renewNote')}
          </div>
        )}

        {/* Зачёт не посчитался (Stripe не ответил) — честно говорим, что сумма
            предварительная, вместо того чтобы выдать полную цену за точную. */}
        {preview?.estimated && (
          <div style={{ fontSize: '11.5px', color: 'var(--muted)', lineHeight: 1.6 }}>
            {t('payModal.estimatedNote')}
          </div>
        )}

        {/* Реквизиты, которыми выпишется фактура. Показываем ЗДЕСЬ, до нажатия
            «Оплатить»: финализированный счёт Stripe не пересчитывает, и заметить
            чужой адрес или отсутствующий VAT надо ДО списания. Сюда модалка
            доезжает только с заполненным профилем (гейт в useBillingCalculator),
            поэтому запасного «введите реквизиты» тут нет. */}
        {profile?.filled && (
          <div style={{ padding: '12px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, fontSize: '11.5px', color: 'var(--muted)', lineHeight: 1.6 }}>
              <span style={{ fontWeight: 700, color: 'var(--onyx)' }}>{t('profile.preview.billTo')}: </span>
              {[profile.line1, profile.postal_code, profile.city, profile.country].filter(Boolean).join(', ')}
              {profile.vat_id ? ` · VAT ${profile.vat_id}` : ''}
            </div>
            <button
              type="button"
              onClick={onEditProfile}
              style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontSize: '11.5px', color: 'var(--peach)', fontWeight: 700, cursor: 'pointer' }}
            >
              {t('profile.edit')}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <InfoIcon />
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{t('payModal.cardNote')}</span>
        </div>
      </ModalBody>
      <ModalFooter>
        {/* Одна кнопка и один шаг: следующий экран — уже Stripe. */}
        <PrimaryButton onClick={onPay} loading={payBusy} disabled={previewBusy}>
          {t('pay')}
        </PrimaryButton>
      </ModalFooter>
    </ModalShell>
  );
}
