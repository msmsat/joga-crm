import { useTranslation } from 'react-i18next';
import { useStudioCurrency } from '../../../../../../hooks/useStudioCurrency';
import { getCurrencySymbol } from '../../../../../../components/UI';
import type { DiscountSegment } from '../../../../../../api/loyalty/loyalty.types';
import { parseDay, type DiscountType } from './discountModel';

/** Как скидка звучит словами: размер, даты, период, группы — одним набором
 *  для карточки, превью и шкалы, чтобы «−20 %» везде было написано одинаково. */
export function useDiscountFormat() {
  const { t, i18n } = useTranslation('loyalty');
  const symbol = getCurrencySymbol(useStudioCurrency());
  const lang = i18n.language;
  const thisYear = new Date().getFullYear();

  const money = (n: number) => `${n.toLocaleString(lang)}\u00A0${symbol}`;

  // Минус — типографский (U+2212), неразрывный пробел перед знаком процента там,
  // где язык его ставит, решает Intl: «−20 %» по-французски, «−20%» по-английски.
  const value = (type: DiscountType, raw: number | string) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return type === 'percent' ? '−0%' : `−0\u00A0${symbol}`;
    return type === 'percent'
      ? `−${new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }).format(n / 100)}`
      : `−${money(n)}`;
  };

  // Год — только у дат не этого года: «12 окт.» помещается в строку карточки.
  const day = (value: string) => {
    const date = parseDay(value);
    return date.toLocaleDateString(lang, {
      day: 'numeric', month: 'short', ...(date.getFullYear() !== thisYear ? { year: 'numeric' as const } : {}),
    });
  };

  const period = (from: string | null, until: string | null) => {
    if (from && until) return t('discounts.period.range', { from: day(from), until: day(until) });
    if (from) return t('discounts.period.from', { date: day(from) });
    if (until) return t('discounts.period.until', { date: day(until) });
    return t('discounts.period.forever');
  };

  const segment = (key: DiscountSegment) => t(`discounts.segments.${key}.title`);

  return { money, value, day, period, segment, symbol };
}
