import { useTranslation } from 'react-i18next';
import type { LessonCompensation } from '../../../../../api/schedule/schedule.types';
import { formatMoney } from '../../../../../lib/money';

export function MasterCompensation({ value, currency }: { value: LessonCompensation | null | undefined; currency?: string }) {
  const { t, i18n } = useTranslation('journal');
  if (!value) return null;
  const key = 'lessonCard.compensation';
  let text: string;
  let formula = '';
  if (value.kind === 'salary') text = t(`${key}.salary`);
  else if (value.kind === 'unconfigured') text = t(`${key}.unconfigured`);
  else if (value.amount == null) text = t(`${key}.unavailable`);
  else {
    const label = t(`${key}.${value.kind === 'owner' ? 'owner' : 'master'}`);
    const rate = value.rate?.toLocaleString(i18n.language) ?? '—';
    text = `${label}: ${formatMoney(value.amount, currency)}`;
    if (value.kind === 'hourly') {
      const hours = (value.duration_min / 60).toLocaleString(i18n.language, { maximumFractionDigits: 2 });
      text += ` · ${t(`${key}.hourly`, { rate: formatMoney(value.rate ?? 0, currency) })} × ${hours}`;
    } else {
      text += ` · ${rate}%`;
      formula = `${formatMoney(value.base_amount ?? 0, currency)} × ${rate}% = ${formatMoney(value.amount, currency)}. `;
    }
  }
  return <span className="lc-compensation" title={`${formula}${t(`${key}.estimate`)}`}>{text}</span>;
}
