import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlanType, PlanPeriod } from '../../types';
import type { PlanInfo } from '../../hooks/useBillingCalculator';
import { formatMoney } from '../../../../../lib/money';
import { planSeats } from '../../../../../lib/plan';
import { ZapIcon } from './BillingIcons';
import styles from '../../Billing.module.css';

interface Props {
  /** Ступени каталога по возрастанию: «s2» … «s20», «unlimited». */
  planIds: PlanType[];
  plans: Record<PlanType, PlanInfo>;
  selected: PlanType;
  onSelect: (plan: PlanType) => void;
  currency?: string;
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
  /** Открывает расчёт и оплату (единственная кнопка платежа на вкладке). */
  onPay: () => void;
  /** Ступень, за которую студия платит сейчас, — бейджем «Текущий». */
  currentPlanId: PlanType | null;
}

/**
 * Тариф = места. Ползунок идёт по ступеням каталога (от 2 сотрудников до 20 и
 * «безлимит» на конце), рядом — период оплаты, справа — что за эти деньги
 * получает студия.
 *
 * Все числа приходят с сервера (GET /billing/plans): цена входа и шаг за место
 * считаются разностью соседних ступеней, лимиты клиентов и обращений к ИИ —
 * из лимитов самой ступени. Своей формулы цены здесь нет и быть не должно —
 * второй прайс-лист на фронте пережил бы правку plans.py и обещал бы неправду.
 */
export default function PlanCalculator({
  planIds, plans, selected, onSelect, currency,
  selectedPeriod, setSelectedPeriod, periodDiscounts,
  monthly, fullMonthly, savedTotal, totalToPay, onPay, currentPlanId,
}: Props) {
  const { t, i18n } = useTranslation('billing');

  const seats = planSeats(selected);
  const info = plans[selected];
  const index = Math.max(planIds.indexOf(selected), 0);
  const last = Math.max(planIds.length - 1, 0);
  const fill = last ? (index / last) * 100 : 0;
  const base = plans[planIds[0]]?.monthly ?? 0;
  const step = (plans[planIds[1]]?.monthly ?? 0) - base;

  // Периоды и скидки диктует каталог: захардкоженные «6 / 12 / 24» пережили бы
  // правку и обещали скидку, которой сервер уже не даёт.
  const periods = Object.keys(periodDiscounts).map(Number).sort((a, b) => a - b);
  const best = periods.reduce((a, b) => (periodDiscounts[b] > periodDiscounts[a] ? b : a), periods[0]);
  const discount = periodDiscounts[selectedPeriod] || 0;

  const count = (value: number) => value.toLocaleString(i18n.language || 'en');

  // Сравнение для блока выгоды: тот же срок помесячно против выбранного периода.
  // Разница — это ровно savedTotal из хука, второй арифметики тут нет.
  const fullTotal = Math.round(fullMonthly * selectedPeriod * 100) / 100;
  // Сколько месяцев покрывает сэкономленное — только если хотя бы один (без фейка).
  const freeMonths = monthly > 0 ? Math.floor(savedTotal / monthly) : 0;
  const gainNote = savedTotal <= 0
    // Выгоды пока нет — вместо «вы сэкономили 0» подсказка, где она начинается.
    ? t('savings.emptyState')
    : freeMonths >= 1
      ? t('savings.freeMonths', { count: freeMonths })
      : t('savings.youSave', { amount: formatMoney(savedTotal, currency), months: selectedPeriod });
  // Прочерк вместо пропущенной строки: набор строк в панели ВСЕГДА один и тот
  // же. Иначе панель прыгала на каждом переключении периода — появлялась
  // экономия, исчезала цена за место на безлимите, — и кнопка оплаты уезжала
  // из-под пальца ровно в тот момент, когда на неё целятся.
  const DASH = '—';

  const rows: { label: string; value: string; accent?: boolean }[] = [
    // Цена за место — то, ради чего линия и существует: ступень выше стоит
    // дороже, но каждый следующий сотрудник обходится дешевле предыдущего.
    seats
      ? {
        label: t('seats.perSeat'),
        value: `${formatMoney(Math.round((monthly / seats) * 100) / 100, currency)} ${t('planCards.perMonth')}`,
      }
      : { label: t('limits.staff'), value: t('limits.unlimited') },
    {
      label: t('limits.clients'),
      // Лимиты берём только у ступени, которая реально приехала с сервера: у
      // ненайденной они читались бы как null, то есть «без ограничений», —
      // а это обещание, а не заглушка.
      value: !info ? DASH : info.clients == null ? t('limits.unlimited') : count(info.clients),
    },
    {
      label: t('limits.ai'),
      value: !info ? DASH : info.ai == null ? t('limits.unlimited') : `${count(info.ai)} ${t('planCards.perMonth')}`,
    },
    {
      label: t('savings.title'),
      value: savedTotal > 0 ? formatMoney(savedTotal, currency) : DASH,
      accent: savedTotal > 0,
    },
  ];

  return (
    <div className={styles.calcCard}>
      <div className={styles.calcGrid}>

        {/* ── Выбор: места и период ── */}
        <div className={styles.calcPick}>
          <span className={styles.calcEyebrow}>{t('seats.title')}</span>

          <div className={styles.calcSeats}>
            <span className={styles.calcSeatsNum}>{seats === null ? '∞' : seats}</span>
            <span className={styles.calcSeatsLabel}>
              {seats === null ? t('planCards.staffUnlimited') : t('planCards.staffLimit', { count: seats })}
            </span>
            {currentPlanId === selected && <span className={styles.calcBadge}>{t('planCards.current')}</span>}
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
            disabled={last === 0}
          />
          {/* Подписи концов линии — из каталога; пока он не приехал, подписывать
              нечего (вышло бы «До 0 сотрудников»). */}
          {last > 0 && (
            <div className={styles.calcTicks}>
              <span>{t('planCards.staffLimit', { count: planSeats(planIds[0]) ?? 0 })}</span>
              <span>∞ {t('planCards.staffUnlimited')}</span>
            </div>
          )}

          <p className={styles.calcHint}>
            {t('seats.hint', { amount: formatMoney(base, currency) })}
            {' · '}
            {seats === null
              ? t('seats.unlimitedNote')
              : t('seats.stepNote', { amount: formatMoney(step, currency) })}
          </p>

          {/* ── Выгода: два столбца настоящими деньгами ──
              Слева — во сколько обойдётся тот же срок помесячно, справа — во
              сколько он обходится на выбранном периоде; разница между их
              высотами и есть экономия. Тянется по остатку высоты (flex: 1),
              поэтому плитки периода прижаты к низу колонки. На телефоне блока
              нет: там и без него хватает деталей на экран. */}
          <div className={styles.calcGain}>
            <span className={styles.calcEyebrow}>{t('savings.title')}</span>

            <div className={styles.calcGainBars}>
              <div className={styles.calcGainCol}>
                <span key={fullTotal} className={styles.calcGainSum}>{formatMoney(fullTotal, currency)}</span>
                <div className={styles.calcGainTrack}>
                  <div className={styles.calcGainBar} style={{ height: '100%' }} />
                </div>
                <span className={styles.calcGainCap}>{t('period.noDiscount')}</span>
              </div>

              <div className={styles.calcGainCol}>
                <span key={totalToPay} className={`${styles.calcGainSum} ${styles.calcGainSumOn}`}>
                  {formatMoney(totalToPay, currency)}
                </span>
                <div className={styles.calcGainTrack}>
                  <div
                    className={`${styles.calcGainBar} ${styles.calcGainBarOn}`}
                    style={{ height: `${(1 - discount) * 100}%` }}
                  >
                    {/* Процент — внутри столбца: снаружи он висел непонятно к
                        чему относящейся подписью. */}
                    {discount > 0 && (
                      <span className={styles.calcGainTag}>−{Math.round(discount * 100)}%</span>
                    )}
                  </div>
                </div>
                <span className={styles.calcGainCap}>{t(`period.${selectedPeriod}`)}</span>
              </div>
            </div>

            <p className={styles.calcGainNote}>{gainNote}</p>
          </div>

          <div className={styles.calcRule} />

          <span className={styles.calcEyebrow}>{t('period.title')}</span>
          <div className={styles.calcPeriods}>
            {periods.map(period => {
              const off = Math.round((periodDiscounts[period] || 0) * 100);
              return (
                <button
                  key={period}
                  type="button"
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
          <span className={styles.calcEyebrow}>{t('planCards.yourPrice')}</span>

          <div className={styles.calcPrice}>
            {/* key — чтобы CSS-анимация проигрывалась заново на каждой новой
                сумме: цифра приподнимается, а не подменяется втихую. */}
            <span key={monthly} className={styles.calcPriceNum}>{formatMoney(monthly, currency)}</span>
            <span className={styles.calcPriceUnit}>{t('planCards.perMonth')}</span>
          </div>

          {/* Строка под ценой есть всегда — со скидкой в ней зачёркнутая цена и
              процент, без скидки «Без скидки». Прятать её значило бы двигать
              всё, что ниже, при каждом переключении периода. */}
          <div className={styles.calcOld}>
            {discount > 0 ? (
              <>
                <span className={styles.calcOldPrice}>{formatMoney(fullMonthly, currency)}</span>
                <span className={styles.calcOff}>−{Math.round(discount * 100)}%</span>
              </>
            ) : (
              <span className={styles.calcOldPrice}>{t('period.noDiscount')}</span>
            )}
          </div>

          {/* Полоса «сколько платите / сколько экономите»: доли едут шириной,
              поэтому разница между 3 и 12 месяцами видна движением, а не
              сравнением двух чисел. */}
          <div className={styles.calcMeter} aria-hidden>
            <div className={styles.calcMeterPaid} style={{ width: `${(1 - discount) * 100}%` }} />
            <div className={styles.calcMeterSaved} style={{ width: `${discount * 100}%` }} />
          </div>

          <div className={styles.calcRows}>
            {rows.map(row => (
              <div key={row.label} className={styles.calcRow}>
                <span className={styles.calcRowLabel}>{row.label}</span>
                <span className={`${styles.calcRowValue} ${row.accent ? styles.calcRowAccent : ''}`}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* Итог и оплата. Класс bl-pay-cta глобальный: на телефоне этот же
              узел становится полосой над нижней панелью (Billing.module.css). */}
          <div className={`${styles.calcCta} bl-pay-cta`}>
            <div className={styles.calcTotal}>
              <span className={styles.calcTotalLabel}>{t('paymentSchedule.total')}</span>
              <span key={totalToPay} className={styles.calcTotalValue}>{formatMoney(totalToPay, currency)}</span>
            </div>
            {/* Цены в каталоге без НДС (stripe_catalog.TAX_BEHAVIOR = "exclusive"),
                налог Stripe Tax накидывает сверху на своей странице. Без этой
                строки итог в счёте оказывался бы заметно больше показанного. */}
            <p className={styles.calcVat}>{t('paymentSchedule.vatNote')}</p>
            <button type="button" onClick={onPay} className={styles.calcPay}>
              <ZapIcon /> {selectedPeriod > 1 ? t('paymentSchedule.payFor', { count: selectedPeriod }) : t('pay')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
