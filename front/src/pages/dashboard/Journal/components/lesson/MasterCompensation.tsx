// Сколько мастер получит за занятие — карточкой в попапе занятия, а не мелкой
// припиской под именем: процент кольцом, сумма крупно, под ней — от чего
// посчитано и в каком состоянии деньги. Процент берётся от того, что клиенты
// ЗАПЛАТИЛИ (со скидкой −50 % — от половины), а не от прайса; правило одно и
// живёт на сервере (back/services/lesson_compensation.py), здесь только вид.
import { useTranslation } from 'react-i18next';
import type { LessonCompensation } from '../../../../../api/schedule/schedule.types';
import { formatMoney } from '../../../../../lib/money';
import './masterPayout.css';

type PayState = 'paid' | 'partial' | 'due' | 'estimated';

interface Props {
  value: LessonCompensation | null | undefined;
  currency?: string;
  /** Цена занятия с одного клиента — для занятия, на которое ещё никто не записан. */
  price?: number;
  /** Записанных нет: показать, сколько мастер получит с каждого клиента. */
  empty?: boolean;
}

/** Где деньги, от которых считается доля: все прошли, часть, ждут или о них
 *  ничего не известно (перенос из прошлой системы). Нечего считать — null. */
function stateOf(v: LessonCompensation): PayState | null {
  const base = v.base_amount ?? 0;
  const paid = v.paid_base ?? 0;
  if (base <= 0) return null;
  if (paid >= base) return 'paid';
  if (paid > 0) return 'partial';
  return (v.due_base ?? 0) > 0 ? 'due' : 'estimated';
}

export function MasterCompensation({ value, currency, price = 0, empty = false }: Props) {
  const { t, i18n } = useTranslation('journal');
  if (!value) return null;
  const key = 'lessonCard.compensation';
  const money = (n: number) => formatMoney(n, currency);
  const label = t(`${key}.${value.kind === 'owner' ? 'owner' : 'master'}`);
  const estimate = t(`${key}.estimate`);

  // Считать по занятию нечего: оклад, ставка не задана, абонементы без цены.
  if (value.kind === 'salary' || value.kind === 'unconfigured' || value.amount == null) {
    const [title, hint] = value.kind === 'salary' ? [t(`${key}.salary`), t(`${key}.salaryHint`)]
      : value.kind === 'unconfigured' ? [t(`${key}.unconfigured`), t(`${key}.setRate`)]
      : [t(`${key}.unavailable`), null];
    return (
      <div className="lc-pay is-quiet" title={estimate}>
        <span className="lc-pay-badge" aria-hidden><WalletIcon /></span>
        <span className="lc-pay-body">
          <span className="lc-pay-label">{label}</span>
          <span className="lc-pay-note">{title}</span>
          {hint && <span className="lc-pay-formula">{hint}</span>}
        </span>
      </div>
    );
  }

  if (value.kind === 'hourly') {
    const hours = (value.duration_min / 60).toLocaleString(i18n.language, { maximumFractionDigits: 2 });
    return (
      <div className="lc-pay" title={estimate}>
        <span className="lc-pay-badge is-accent" aria-hidden><ClockIcon /></span>
        <span className="lc-pay-body">
          <span className="lc-pay-label">{label}</span>
          <strong className="lc-pay-amount">{money(value.amount)}</strong>
          <span className="lc-pay-formula">
            {`${t(`${key}.hourly`, { rate: money(value.rate ?? 0) })} × ${hours}`}
          </span>
        </span>
      </div>
    );
  }

  const rate = value.rate ?? 0;
  const rateText = rate.toLocaleString(i18n.language, { maximumFractionDigits: 2 });
  const base = value.base_amount ?? 0;
  const state = empty ? null : stateOf(value);
  const paidShare = value.paid_amount ?? 0;
  // Пустое занятие: доля с одного клиента по цене — округлена так же, как сервер.
  const amount = empty ? Math.round(price * rate) / 100 : value.amount;
  const formula = empty
    ? t(`${key}.perClient`, { rate: rateText, price: money(price) })
    : t(`${key}.of`, { rate: rateText, base: money(base) });
  const unknown = value.unknown_count ?? 0;

  return (
    <div className={`lc-pay${state ? ` is-${state}` : ''}`} title={estimate}>
      <Ring rate={rate} text={rateText} />
      <span className="lc-pay-body">
        <span className="lc-pay-head">
          <span className="lc-pay-label">{label}</span>
          {state && (
            <span className={`lc-pay-chip is-${state}`}>
              {state === 'paid' && <CheckIcon />}
              {t(`${key}.state.${state}`)}
            </span>
          )}
        </span>
        <strong className="lc-pay-amount">{empty ? `≈ ${money(amount)}` : money(amount)}</strong>
        <span className="lc-pay-formula">{formula}</span>
      </span>

      {/* Часть денег прошла, часть ещё нет — из чего сложена сумма мастера. */}
      {state === 'partial' && (
        <span className="lc-pay-split">
          <span className="lc-pay-bar" aria-hidden>
            <span style={{ width: `${Math.min(100, (value.paid_base ?? 0) / base * 100)}%` }} />
          </span>
          <span className="lc-pay-legend">
            <span className="is-paid">{t(`${key}.split.paid`, { amount: money(paidShare) })}</span>
            <span>{t(`${key}.split.pending`, { amount: money(Math.max(0, value.amount - paidShare)) })}</span>
          </span>
        </span>
      )}
      {unknown > 0 && <span className="lc-pay-foot">{t(`${key}.unknown`, { number: unknown })}</span>}
    </div>
  );
}

/** Доля мастера кольцом: заполнено ровно на его процент. */
function Ring({ rate, text }: { rate: number; text: string }) {
  const filled = Math.max(0, Math.min(100, rate));
  return (
    <span className="lc-pay-ring" aria-hidden>
      <svg viewBox="0 0 56 56" width="56" height="56">
        <circle className="lc-pay-ring-track" cx="28" cy="28" r="23" />
        {filled > 0 && (
          <circle className="lc-pay-ring-arc" cx="28" cy="28" r="23" pathLength={100}
                  strokeDasharray={`${filled} 100`} transform="rotate(-90 28 28)" />
        )}
      </svg>
      <span className="lc-pay-ring-value">{text}<small>%</small></span>
    </span>
  );
}

const svg = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const WalletIcon = () => (
  <svg {...svg}><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v3h-4a2 2 0 0 0 0 4h4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" /></svg>
);
const ClockIcon = () => (
  <svg {...svg}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
const CheckIcon = () => (
  <svg {...svg} width={11} height={11} strokeWidth={3}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
