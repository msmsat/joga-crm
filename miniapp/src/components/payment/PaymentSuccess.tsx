import { Fragment, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import AmountReels from './AmountReels';
import SuccessSeal, { IMPACT_MS } from './SuccessSeal';
import { useModalLock } from './useModalLock';
import styles from './PaymentSuccess.module.css';

export type PaymentSuccessPayment = {
  id: number;
  kind: 'booking' | 'subscription';
  amount_str: string;
  title: string;
  starts_at?: string | null;
};

type Props = {
  payment: PaymentSuccessPayment;
  studio?: { name: string; logo_url?: string | null };
  onClose: () => void;
  onContinue: () => void;
};

/**
 * Mount only after the server confirms payment AND completes the purchase.
 *
 * Одна постановка: печать касается карточки, и от этого касания (`--impact`)
 * выходят заголовок, чек и сумма. Ничего не живёт своим таймером.
 */
export default function PaymentSuccess({ payment, studio, onClose, onContinue }: Props) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const isBooking = payment.kind === 'booking';
  const date = payment.starts_at ? new Date(payment.starts_at) : null;
  const startsAt = date && Number.isFinite(date.getTime())
    ? date.toLocaleString(i18n.resolvedLanguage || i18n.language, {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    }) : null;
  const title = t('payment.success.title');

  useModalLock(dialogRef, overlayRef, onClose, styles.scrollLock);

  return createPortal(
    <div ref={overlayRef} className={styles.overlay}>
      <section
        ref={dialogRef}
        className={styles.dialog}
        style={{ '--impact': `${IMPACT_MS}ms` } as CSSProperties}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        data-payment-id={payment.id}
      >
        <header className={styles.header}>
          {studio?.name ? (
            <div className={styles.studio}>
              <span className={styles.studioMark} aria-hidden="true">
                {studio.logo_url && failedLogo !== studio.logo_url ? (
                  <img src={studio.logo_url} alt="" onError={() => setFailedLogo(studio.logo_url!)} />
                ) : studio.name.trim().slice(0, 1)}
              </span>
              <span className={styles.studioName}>{studio.name}</span>
            </div>
          ) : <span />}
          <button type="button" className={styles.close} onClick={onClose} aria-label={t('payment.success.close')}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
          </button>
        </header>

        <SuccessSeal />

        <div className={styles.message}>
          {/* Слова поднимаются из-под строки по одному — вслед за ударом. */}
          <h1 id={titleId}>
            {title.split(' ').map((word, index) => (
              <Fragment key={index}>
                {index > 0 && ' '}
                <span className={styles.word}>
                  <span style={{ animationDelay: `calc(var(--impact) + ${60 + index * 85}ms)` }}>{word}</span>
                </span>
              </Fragment>
            ))}
          </h1>
          <p id={descriptionId}>{t(isBooking ? 'payment.success.booking_hint' : 'payment.success.subscription_hint')}</p>
        </div>

        <div className={styles.ticket}>
          <div className={styles.ticketMain}>
            <div className={styles.ticketTop}>
              <span className={styles.purchaseLabel}>{t(isBooking ? 'payment.success.service' : 'payment.success.subscription')}</span>
              <span className={styles.paid}><span />{t('payment.success.paid')}</span>
            </div>
            <h2>{payment.title || t(isBooking ? 'payment.success.service' : 'payment.success.subscription')}</h2>
            {startsAt && isBooking && (
              <p className={styles.date}>
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="4" /><path d="M8 3v4m8-4v4M4 11h16m-11 5h2" /></svg>
                <time dateTime={payment.starts_at!}>{startsAt}</time>
              </p>
            )}
          </div>
          <div className={styles.ticketStub}>
            <span>{t('payment.success.amount')}</span>
            <strong><AmountReels value={payment.amount_str} /></strong>
          </div>
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.continue} onClick={onContinue}>
            {t(isBooking ? 'payment.success.bookings' : 'payment.success.profile')}
          </button>
          <p>{t('payment.success.thanks')}</p>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
