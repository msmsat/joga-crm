import { useTranslation } from 'react-i18next';
import type { EventRecord } from '../../../../../api/clients/clients.types';
import { formatMoney } from '../../../../../lib/money';
import { VISIT_TONES, bonusTotals, paymentTotal, visitBreakdown, type EventTab } from '../../utils/clientEvents';
import styles from './ClientEvents.module.css';

/**
 * Итог вкладки над лентой. У «Записей» это полоса с легендой — заодно ключ к
 * цветам ленты: человек впервые в карточке сразу видит, что зелёное — пришёл,
 * розовое — отменено. У «Всех» сводки нет: там просто история.
 */
export function EventSummary({ tab, events, currency }: { tab: EventTab; events: EventRecord[]; currency?: string }) {
  const { t, i18n } = useTranslation('clients');
  const locale = i18n.resolvedLanguage || i18n.language;
  if (tab === 'visits') {
    const counts = visitBreakdown(events);
    const shown = VISIT_TONES.filter(tone => counts[tone] > 0);
    return (
      <section className={styles.summary} aria-label={t('panel.events.summary.visits')}>
        <div className={styles.summaryTitle}>{t('panel.events.summary.visits')}</div>
        <div className={styles.bar} aria-hidden="true">
          {shown.map(tone => <span key={tone} className={`${styles.barPart} ${styles[tone]}`} style={{ flexGrow: counts[tone] }}/>)}
        </div>
        <div className={styles.legend}>
          {shown.map(tone => (
            <div key={tone} className={`${styles.legendRow} ${styles[tone]}`}>
              <span className={styles.legendDot}/>
              {/* «Завершено» рядом с «Посещено» читалось бы как ещё одна явка. */}
              <span>{t(tone === 'done' ? 'panel.events.noMark' : `panel.events.state.${tone}`)}</span>
              <span className={styles.legendCount}>{counts[tone]}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (tab === 'payments') {
    return (
      <section className={`${styles.summary} ${styles.payment}`}>
        <div className={styles.figure}>{formatMoney(paymentTotal(events), currency)}</div>
        <div className={styles.figureLabel}>{t('panel.events.summary.paidTotal')}</div>
      </section>
    );
  }
  if (tab === 'bonuses') {
    const { earned, spent } = bonusTotals(events);
    return (
      <section className={`${styles.summary} ${styles.figures}`}>
        <div className={styles.bonusIn}>
          <div className={styles.figure}>+{earned.toLocaleString(locale)}</div>
          <div className={styles.figureLabel}>{t('panel.events.summary.earned')}</div>
        </div>
        <div className={styles.bonusOut}>
          <div className={styles.figure}>−{spent.toLocaleString(locale)}</div>
          <div className={styles.figureLabel}>{t('panel.events.summary.spent')}</div>
        </div>
      </section>
    );
  }
  return null;
}
