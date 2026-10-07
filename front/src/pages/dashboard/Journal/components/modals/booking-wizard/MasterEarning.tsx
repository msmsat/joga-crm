// «Анастасия получит 272 Kč» — заработок мастера за эту запись по его ставке.
// Процент — от того, что заплатит клиент, СО скидкой (считает сервер, то же
// правило, что у зарплаты): 40 % от 680, а не от 850. Полоса делит сумму
// клиента на долю мастера и долю студии; скидка, после которой студия уходит в
// минус, говорится прямо. Видит только владелец — сервер больше никому ставку
// не присылает.
import { useTranslation } from 'react-i18next';
import * as Icons from '../../../../../../components/Icons';
import type { PaymentPreview } from '../../../../../../api/booking/hybrid.types';
import { earningOf } from './settleModel';
import { CountMoney } from './SettleReceipt';

interface Props {
  preview: PaymentPreview;
  name: string;
  money: (value: number) => string;
}

export function MasterEarning({ preview, name, money }: Props) {
  const { t, i18n } = useTranslation('journal');
  const earning = earningOf(preview.compensation, preview, preview.covered_by != null);
  if (!earning) return null;

  const lang = i18n.language;
  const rate = earning.kind === 'percent'
    ? new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 2 }).format(earning.rate / 100)
    : t('lessonCard.compensation.hourly', { rate: money(earning.rate) });
  const hours = new Intl.NumberFormat(lang, { style: 'unit', unit: 'hour', unitDisplay: 'short', maximumFractionDigits: 2 })
    .format(earning.hours);
  const formula = earning.kind === 'percent'
    ? t('wizard.earnings.percentOf', { rate, amount: money(earning.base) })
    : `${rate} × ${hours}`;
  const master = earning.amount ?? 0;
  const masterShare = earning.base > 0 ? Math.min(1, Math.max(0, master / earning.base)) : 0;
  const initial = (name.trim()[0] ?? '·').toLocaleUpperCase(lang);

  return (
    <section className="bw-earn" aria-live="polite">
      <div className="bw-earn-head">
        <span className="bw-earn-avatar" aria-hidden>{initial}</span>
        <div className="bw-earn-who">
          <span className="bw-earn-title">{t('wizard.earnings.title', { name })}</span>
          {earning.amount != null && <span className="bw-earn-formula">{formula}</span>}
        </div>
        {earning.amount != null && (
          <span className="bw-earn-amount"><CountMoney value={earning.amount} money={money} /></span>
        )}
      </div>

      {earning.amount == null && <p className="bw-earn-note">{t('wizard.earnings.subscription')}</p>}

      {earning.split && (
        <div className="bw-earn-split">
          <div className="bw-earn-bar" aria-hidden>
            <span className="bw-earn-master" style={{ width: `${masterShare * 100}%` }} />
            <span className="bw-earn-studio" style={{ width: `${(1 - masterShare) * 100}%` }} />
          </div>
          <div className="bw-earn-legend">
            <span><i className="bw-earn-dot is-master" />{name} · {money(master)}</span>
            <span><i className="bw-earn-dot is-studio" />{t('wizard.earnings.studio')} · {money(earning.studio)}</span>
          </div>
        </div>
      )}

      {earning.split && earning.studio < 0 && (
        <p className="bw-earn-loss" role="status">{t('wizard.earnings.loss', { amount: money(-earning.studio) })}</p>
      )}

      <span className="bw-earn-private" title={t('lessonCard.compensation.estimate')}>
        <Icons.LockIcon /> {t('wizard.earnings.ownerOnly')}
      </span>
    </section>
  );
}
