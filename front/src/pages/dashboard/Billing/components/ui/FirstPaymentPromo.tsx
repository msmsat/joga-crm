import { Check, Ticket } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import styles from './FirstPaymentPromo.module.css';

/** A welcome offer is already applied by the server: there is nothing to activate. */
export default function FirstPaymentPromo({ code, percent, compact = false }: {
  code: string; percent: number; compact?: boolean;
}) {
  const { t, i18n } = useTranslation('billing');
  const reduced = useReducedMotion();
  const value = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(percent);
  return <motion.div className={styles.ticket} data-compact={compact || undefined} role="status"
    initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
    transition={{ duration: reduced ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}>
    <div className={styles.value}><Ticket size={16} aria-hidden="true" /><strong>−{value}%</strong></div>
    <div className={styles.copy}><strong>{t('promo.title')}</strong><span>{t('promo.applied')}</span>
      {!compact && <p>{t('promo.description')}</p>}</div>
    <span className={styles.code}><Check size={12} aria-hidden="true" />{code}</span>
  </motion.div>;
}
