import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Switch } from '../../../../../../components/ui/index';
import type { DiscountCampaign } from '../../../../../../api/loyalty/loyalty.types';
import s from './Discounts.module.css';
import { daysBetween, todayIso } from './discountModel';
import { useDiscountFormat } from './useDiscountFormat';
import { useDiscountSummary } from './useDiscountCatalog';
import { IconTarget, IconUsers } from './DiscountIcons';

interface Props {
  campaign: DiscountCampaign;
  index: number;
  highlighted: boolean;
  busy: boolean;
  onOpen: () => void;
  onToggle: (active: boolean) => void;
}

/** Скидка в списке: статус и срок, название и размер, на что и кому, сколько
 *  раз применена. У скидки с периодом — полоса прошедшего срока: «ещё 4 дня»
 *  видно до того, как прочитаешь даты. */
export default function DiscountCard({ campaign: c, index, highlighted, busy, onOpen, onToggle }: Props) {
  const { t } = useTranslation('loyalty');
  const f = useDiscountFormat();
  const summary = useDiscountSummary();
  const today = todayIso();

  let progress: number | null = null;
  let timing: string;
  if (c.status === 'scheduled' && c.valid_from) {
    timing = t('discounts.card.startsIn', { count: Math.max(1, daysBetween(today, c.valid_from)) });
  } else if (c.status === 'ended') {
    timing = t('discounts.card.ended');
  } else if (c.valid_until) {
    const left = daysBetween(today, c.valid_until) + 1;
    timing = t('discounts.card.daysLeft', { count: left });
    if (c.valid_from) {
      const total = daysBetween(c.valid_from, c.valid_until) + 1;
      progress = Math.min(1, Math.max(0, (total - left) / total));
    }
  } else {
    timing = t('discounts.card.noEnd');
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.32, delay: Math.min(index, 6) * 0.04, ease: [0.2, 0.8, 0.2, 1] }}
      className={`${s.card} ${s[`card_${c.status}`]}${highlighted ? ` ${s.cardFlash}` : ''}`}
    >
      <button type="button" className={s.cardHit} onClick={onOpen} aria-label={t('discounts.card.edit', { name: c.name })} />
      <div className={s.cardTop}>
        <span className={`${s.status} ${s[`status_${c.status}`]}`}>
          <span className={s.statusDot} />
          {t(`discounts.status.${c.status}`)}
        </span>
        <span className={s.cardPeriod}>{f.period(c.valid_from, c.valid_until)}</span>
        <span className={s.cardSwitch} onClick={e => e.stopPropagation()}>
          <Switch checked={c.is_active} disabled={busy} onChange={onToggle} />
        </span>
      </div>
      <div className={s.cardMain}>
        <div className={s.cardName}>{c.name}</div>
        <div className={s.cardValue}>{f.value(c.discount_type, c.value)}</div>
      </div>
      {progress !== null && (
        <div className={s.cardProgress} aria-hidden="true">
          <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: progress }}
                       transition={{ duration: 0.9, delay: 0.15, ease: [0.2, 0.8, 0.2, 1] }} />
        </div>
      )}
      <div className={s.cardFacts}>
        <span><IconTarget size={13} />{summary.scope(c)}</span>
        <span><IconUsers size={13} />{summary.audience(c)}</span>
      </div>
      <div className={s.cardFoot}>
        <span className={s.cardTiming}>{timing}</span>
        <span className={s.cardUsed}>
          {c.used_count > 0 ? t('discounts.card.used', { count: c.used_count }) : t('discounts.card.notUsed')}
        </span>
      </div>
    </motion.div>
  );
}
