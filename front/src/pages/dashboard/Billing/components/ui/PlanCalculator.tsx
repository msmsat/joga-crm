import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlanType, PlanPeriod } from '../../types';
import type { PlanInfo } from '../../hooks/useBillingCalculator';
import { formatMoney } from '../../../../../lib/money';
import { planSeats, planPriceSteps } from '../../../../../lib/plan';
import AnimatedPayButton from './AnimatedPayButton';
import CheckoutDetails from './CheckoutDetails';
import TeamLineup from './TeamLineup';
import FirstPaymentPromo from './FirstPaymentPromo';
import RollingAmount from './RollingAmount';
import { checkoutAmounts } from '../checkout/checkoutAmounts';
import type { CheckoutPreview } from '../../../../../api/billing/billing.types';
import styles from '../../Billing.module.css';

interface Props {
  /** Ступени каталога по возрастанию: «s1» … «s20», «unlimited». */
  planIds: PlanType[];
  plans: Record<PlanType, PlanInfo>;
  selected: PlanType;
  onSelect: (plan: PlanType) => void;
  currency?: string;
  payBusy: boolean;
  preview: CheckoutPreview | null;
  /** Цены и расчёты ещё едут: числа держат место заглушкой, команда ждёт. */
  pending: boolean;
  selectedPeriod: PlanPeriod;
  setSelectedPeriod: (period: PlanPeriod) => void;
  periodDiscounts: Record<number, number>;
  /** Цена выбранной ступени за месяц со скидкой периода (у комбо — половина). */
  monthly: number;
  /** Она же без скидки — зачёркнутая рядом. */
  fullMonthly: number;
  /** Сколько экономит предоплата за весь выбранный период. */
  savedTotal: number;
  /** Сумма за весь период — её и спишут. */
  totalToPay: number;
  /** Открывает страницу реквизитов; сам платёж готовится на следующем шаге. */
  onPay: () => void;
  /** Ступень, за которую студия платит сейчас, — бейджем «Текущий». */
  currentPlanId: PlanType | null;
}

/**
 * Тариф = места. Ползунок идёт по ступеням каталога (от 1 сотрудника до 20 и
 * «безлимит» на конце), рядом — период оплаты, справа — что за эти деньги
 * получает студия.
 *
 * Все числа приходят с сервера (GET /billing/plans): цена входа и шаг за место
 * считаются разностью соседних ступеней, лимиты клиентов и обращений к ИИ —
 * из лимитов самой ступени. Своей формулы цены здесь нет и быть не должно —
 * второй прайс-лист на фронте пережил бы правку plans.py и обещал бы неправду.
 */
export default function PlanCalculator({
  planIds, plans, selected, onSelect, currency, payBusy, preview, pending,
  selectedPeriod, setSelectedPeriod, periodDiscounts,
  monthly, fullMonthly, savedTotal, totalToPay, onPay, currentPlanId,
}: Props) {
  const { t, i18n } = useTranslation('billing');
  const quote = preview?.currency.toUpperCase() === currency?.toUpperCase() ? preview : null;
  const amounts = checkoutAmounts(quote ?? undefined);
  const promo = !pending && amounts.promoDiscount > 0;
  const savingShare = fullMonthly > 0 ? Math.max(0, Math.min(1, savedTotal / (fullMonthly * selectedPeriod))) : 0;
  const savingPercent = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(savingShare * 100);
  const outcome = quote?.tax_outcome ?? 'stripe_auto';
  const checkoutTotal = quote ? (outcome === 'taxable' ? quote.total_with_tax : quote.total) / 100 : totalToPay;
  const taxNote = outcome === 'stripe_auto' || outcome === 'requires_review'
    ? 'paymentSchedule.vatNote' : 'payModal.taxServerNote';

  const seats = planSeats(selected);
  const info = plans[selected];
  const index = Math.max(planIds.indexOf(selected), 0);
  const last = Math.max(planIds.length - 1, 0);
  const fill = last && !pending ? (index / last) * 100 : 0;
  const base = plans[planIds[0]]?.monthly ?? 0;
  const priceSteps = planPriceSteps(planIds.map(id => ({
    seats: planSeats(id), price: Math.round((plans[id]?.monthly ?? 0) * 100),
  }))).map(step => t('seats.stepNote', {
    from: step.from, to: step.to, amount: formatMoney(step.amount / 100, currency),
  })).join(' · ');

  // Периоды и скидки диктует каталог: захардкоженные «6 / 12 / 24» пережили бы
  // правку и обещали скидку, которой сервер уже не даёт.
  const periods = Object.keys(periodDiscounts).map(Number).sort((a, b) => a - b);
  const best = periods.reduce((a, b) => (periodDiscounts[b] > periodDiscounts[a] ? b : a), periods[0]);

  const count = (value: number) => value.toLocaleString(i18n.language || 'en');

  // Прочерк вместо пропущенной строки: набор строк в панели ВСЕГДА один и тот
  // же. Иначе панель прыгала на каждом переключении периода — появлялась
  // экономия, исчезала цена за место на безлимите, — и кнопка оплаты уезжала
  // из-под пальца ровно в тот момент, когда на неё целятся.
  const DASH = '—';
  // Число, которого ещё нет, держит своё место мерцающей заглушкой: текст
  // остаётся в разметке (размеры те же), но не виден — см. .calcFill.
  const fillCls = (cls: string) => `${cls} ${styles.calcFill}`;

  const rows: { label: string; value: string; accent?: boolean }[] = [
    // Цена за место — то, ради чего линия и существует: ступень выше стоит
    // дороже; среднюю цену сотрудника считаем по выбранной ступени.
    seats
      ? {
        label: t('seats.perSeat'),
        value: `${formatMoney(Math.round((monthly / seats) * 100) / 100, currency)} ${t('planCards.perMonth')}`,
      }
      : { label: t('limits.staff'), value: t('limits.unlimited') },
    // Строки «Клиенты» здесь нет намеренно: база клиентов тарифом не
    // ограничена ни на одной ступени (plans._limits), и говорить о ней в
    // перечне того, что ступень даёт, значит намекать на потолок.
    {
      label: t('limits.ai'),
      // Лимиты берём только у ступени, которая реально приехала с сервера: у
      // ненайденной они читались бы как null, то есть «без ограничений», —
      // а это обещание, а не заглушка.
      value: !info ? DASH : info.ai == null ? t('limits.unlimited') : `${count(info.ai)} ${t('planCards.perMonth')}`,
    },
    {
      label: t('savings.title'),
      value: savedTotal > 0 ? formatMoney(savedTotal, currency) : DASH,
      accent: savedTotal > 0,
    },
  ];

  return (
    <div className={styles.calcCard} data-pending={pending || undefined} aria-busy={pending}>
      <div className={styles.calcGrid}>

        {/* ── Выбор: места и период ── */}
        <div className={styles.calcPick}>
          <span className={styles.calcEyebrow}>{t('seats.title')}</span>

          <div className={styles.calcSeats}>
            <span className={fillCls(styles.calcSeatsNum)}>{seats === null ? '∞' : seats}</span>
            <span className={fillCls(styles.calcSeatsLabel)}>
              {seats === null ? t('planCards.staffUnlimited') : t('planCards.staffLimit', { count: seats })}
            </span>
            {!pending && currentPlanId === selected && <span className={styles.calcBadge}>{t('planCards.current')}</span>}
          </div>

          <input
            type="range"
            min={0}
            max={last}
            step={1}
            value={index}
            onChange={e => onSelect(planIds[Number(e.target.value)])}
            aria-label={t('seats.title')}
            aria-valuetext={plans[selected]?.name ?? selected}
            className={styles.calcRange}
            style={{ '--fill': `${fill}%` } as CSSProperties}
            // Ступени ещё не приехали с сервера — двигать нечего.
            disabled={payBusy || pending || last === 0}
          />
          {/* Подписи концов линии — из каталога; пока он не приехал, подписывать
              нечего (вышло бы «До 0 сотрудников»), но строка держит место. */}
          <div className={styles.calcTicks}>
            {last > 0 ? (
              <>
                <span>{t('planCards.staffLimit', { count: planSeats(planIds[0]) ?? 0 })}</span>
                <span>∞ {t('planCards.staffUnlimited')}</span>
              </>
            ) : <span>&nbsp;</span>}
          </div>

          <p className={fillCls(styles.calcHint)}>
            {t('seats.hint', { amount: formatMoney(base, currency) })}
            {' · '}
            {seats === null
              ? t('seats.unlimitedNote')
              : priceSteps}
          </p>

          {/* ── Команда фигурками ──
              Экономию здесь больше не рисуем: её трижды показывает панель цены
              (зачёркнутая цена, полоса, строка «Ваша экономия»), а два широких
              столбца с суммами за период только повторяли её. Блок тянется по
              остатку высоты (flex: 1), поэтому плитки периода прижаты к низу
              колонки. На телефоне его нет: там и без него хватает деталей. */}
          <TeamLineup planIds={planIds} selected={selected} onSelect={onSelect} disabled={payBusy} pending={pending} />

          <div className={styles.calcRule} />

          <span className={styles.calcEyebrow}>{t('period.title')}</span>
          <div className={styles.calcPeriods}>
            {periods.map(period => {
              const off = Math.round((periodDiscounts[period] || 0) * 100);
              return (
                <button
                  key={period}
                  type="button"
                  disabled={payBusy}
                  onClick={() => setSelectedPeriod(period)}
                  aria-pressed={selectedPeriod === period}
                  className={styles.calcPeriod}
                >
                  {period === best && <span className={styles.calcBest}>{t('planCards.bestChoice')}</span>}
                  <span className={styles.calcPeriodName}>{t(`period.${period}`)}</span>
                  {/* Только процент: «−15% скидка» в плитке шириной с палец
                      переносится на вторую строку и разъезжает ряд. */}
                  <span className={styles.calcPeriodOff}>{off > 0 ? `−${off}%` : '—'}</span>
                </button>
              );
            })}
          </div>

        </div>

        {/* ── Итог: что стоит выбранная ступень ── */}
        <div className={styles.calcPanel}>
          {promo && <FirstPaymentPromo code={amounts.promoCode!} percent={amounts.promoPercent} />}
          <div className={styles.calcPriceHeading}>
            <span className={styles.calcEyebrow}>{t(promo ? 'promo.priceLabel' : 'planCards.yourPrice')}</span>
          </div>

          <div className={styles.calcPrice}>
            {/* key — чтобы CSS-анимация проигрывалась заново на каждой новой
                сумме: цифра приподнимается, а не подменяется втихую. */}
            <span key={`${monthly}:${currency}`} className={fillCls(styles.calcPriceNum)}>{formatMoney(monthly, currency)}</span>
            <span className={styles.calcPriceUnit}>{t('planCards.perMonth')}</span>
          </div>

          {/* Строка под ценой есть всегда — со скидкой в ней зачёркнутая цена и
              процент, без скидки «Без скидки». Прятать её значило бы двигать
              всё, что ниже, при каждом переключении периода. */}
          <div className={styles.calcOld}>
            {savedTotal > 0 ? (
              <>
                <span className={fillCls(styles.calcOldPrice)}>{formatMoney(fullMonthly, currency)}</span>
                <span className={fillCls(styles.calcOff)}>{t('promo.combinedDiscount', { percent: savingPercent })}</span>
              </>
            ) : (
              // Не зачёркнуто: зачёркнутое «Без скидки» читалось как «скидка есть».
              <span className={fillCls(styles.calcOldNote)}>{t('period.noDiscount')}</span>
            )}
          </div>

          {/* Полоса «сколько платите / сколько экономите»: доли едут шириной,
              поэтому разница между 3 и 12 месяцами видна движением, а не
              сравнением двух чисел. */}
          <div className={styles.calcMeter} aria-hidden>
            <div className={styles.calcMeterPaid} style={{ width: `${(1 - savingShare) * 100}%` }} />
            <div className={styles.calcMeterSaved} style={{ width: `${savingShare * 100}%` }} />
          </div>

          {promo && <p className={styles.calcNextPrice}>{t('promo.nextPurchase', {
            amount: formatMoney(amounts.amountBeforePromo! / 100 / selectedPeriod, currency),
          })}</p>}
          <div className={styles.calcRows}>
            {promo && <div className={styles.calcRow}>
              <span className={styles.calcRowLabel}>{t('promo.savings', { percent: amounts.promoPercent })}</span>
              <span className={`${styles.calcRowValue} ${styles.calcPromoSaving}`}>−{formatMoney(amounts.promoDiscount / 100, currency)}</span>
            </div>}
            {rows.map(row => (
              <div key={row.label} className={styles.calcRow}>
                <span className={styles.calcRowLabel}>{row.label}</span>
                <span className={fillCls(`${styles.calcRowValue} ${row.accent ? styles.calcRowAccent : ''}`)}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          <CheckoutDetails preview={quote} pending={pending} />

          {/* Итог и оплата. Класс bl-pay-cta глобальный: на телефоне итог с
              кнопкой становится второй капсулой дока (Billing.module.css), а
              сноска о налоге остаётся здесь, в панели. На десктопе обёртка —
              display: contents, и порядок прежний: итог, сноска, кнопка. */}
          <div className={styles.calcCta}>
            <div className={`${styles.calcBar} bl-pay-cta mnav-kin`}>
              <div className={styles.calcTotal}>
                <span className={fillCls(styles.calcTotalLabel)}>{t(outcome === 'taxable' ? 'payModal.totalWithTax' : outcome === 'stripe_auto' || outcome === 'requires_review' ? 'checkout.totalBeforeTax' : 'paymentSchedule.total')}</span>
                <RollingAmount text={formatMoney(checkoutTotal, currency)} className={fillCls(styles.calcTotalValue)} />
                {/* Только в капсуле телефона: в панели экономию и так называют
                    строка «Ваша экономия» и бейдж под ценой. */}
                {savedTotal > 0 && <span className={fillCls(styles.calcTotalOff)}>−{savingPercent}%</span>}
              </div>
              <AnimatedPayButton onClick={onPay} className={styles.calcPay} loading={payBusy}
                disabled={!info}>
                {selectedPeriod > 1 ? t('paymentSchedule.payFor', { count: selectedPeriod }) : t('pay')}
              </AnimatedPayButton>
            </div>
            {/* Налог определяется по реквизитам на следующем шаге.
                Отсутствие предварительного расчёта не блокирует переход к форме. */}
            <p className={fillCls(styles.calcVat)}>{t(taxNote)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
