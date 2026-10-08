import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { errorMessage } from '../../../../../api/errorMessage'
import type { Gateway } from '../../../../../api/finances/finances.types'
import type { StripeGateState } from '../../stripeStatus'
import styles from './StripeGateModal.module.css'

interface Props {
  state: StripeGateState
  gateway?: Gateway
  isConnecting: boolean
  isRefreshing: boolean
  connectError: unknown
  onConnect(): void
  onRefresh(): void
  onClose(): void
}

export function StripeGateModal({ state, gateway, isConnecting, isRefreshing, connectError, onConnect, onRefresh, onClose }: Props) {
  const { t } = useTranslation('booking')
  const id = useId()
  const dialog = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); return }
      if (event.key !== 'Tab') return
      const buttons = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
      const first = buttons[0], last = buttons.at(-1)
      if (!first) { event.preventDefault(); return }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) {
        event.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])

  const busy = state === 'loading' || isConnecting || isRefreshing
  const known = !['loading', 'unavailable', 'unconfigured'].includes(state)
  const capabilities = [
    { key: 'payments', value: !known ? 'unknown' : gateway?.charges_enabled ? 'enabled' : 'awaiting' },
    { key: 'payouts', value: !known ? 'unknown' : gateway?.payouts_enabled ? 'enabled' : 'awaiting' },
    { key: 'booking', value: !known ? 'unknown' : gateway?.charges_enabled && gateway?.is_active ? 'enabled' : 'off' },
  ]
  const steps = [
    { key: 'account', done: known && !!gateway?.account_id },
    { key: 'details', done: known && !!gateway?.details_submitted && !gateway?.requirements_due },
    { key: 'accept', done: known && !!gateway?.charges_enabled && !!gateway?.is_active },
  ]
  const opensStripe = state === 'none' || state === 'incomplete' || state === 'requiresInfo'
  const tone = state === 'ready' ? 'success' : state === 'unavailable' || state === 'requiresInfo' ? 'attention' : 'neutral'

  return createPortal(
    <div className={styles.overlay} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={dialog} className={styles.dialog} role="dialog" aria-modal={true}
        aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} tabIndex={-1}>
        <button type="button" className={styles.close} onClick={onClose} aria-label={t('stripeGate.close')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
        <aside className={styles.overview}>
          <div className={styles.brand}><span className={styles.cardIcon} aria-hidden="true"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M2 10h20M6 15h4" /></svg></span><span>Stripe Connect</span></div>
          <h2 className={styles.overviewTitle}>{t('stripeGate.introTitle')}</h2>
          <p className={styles.overviewCopy}>{t('stripeGate.introSub')}</p>
          <ol className={styles.steps} aria-label={t('stripeGate.stepsLabel')}>
            {steps.map((step, index) => <li key={step.key} className={step.done ? styles.stepDone : ''}>
              <span className={styles.stepMarker} aria-hidden="true">{step.done ? '✓' : index + 1}</span>
              <span><strong>{t(`stripeGate.steps.${step.key}.title`)}</strong><span>{t(`stripeGate.steps.${step.key}.sub`)}</span>
                {step.done && <span className={styles.srOnly}>{t('stripeGate.completed')}</span>}</span>
            </li>)}
          </ol>
          <p className={styles.secureNote}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>{t('stripeGate.secure')}</p>
        </aside>
        <section className={styles.content}>
          <div className={`${styles.badge} ${styles[tone]}`} role="status" aria-live="polite"><span aria-hidden="true" />{t(`stripeGate.${state}.badge`)}</div>
          <h1 id={`${id}-title`} className={styles.title}>{t(`stripeGate.${state}.title`)}</h1>
          <p id={`${id}-description`} className={styles.description}>{t(`stripeGate.${state}.sub`)}</p>
          <dl className={styles.capabilities}>
            {capabilities.map(item => <div key={item.key}><dt>{t(`stripeGate.capabilities.${item.key}`)}</dt><dd className={item.value === 'enabled' ? styles.enabled : ''}>{t(`stripeGate.${item.value}`)}</dd></div>)}
          </dl>
          {known && gateway?.charges_enabled && !gateway?.payouts_enabled && <p className={styles.payoutNote}>{t('stripeGate.payoutNote')}</p>}
          {connectError != null && <p className={styles.error} role="alert">{errorMessage(connectError, t)}</p>}
          <div className={styles.actions}>
            <button type="button" className={styles.primary} data-stripe-primary="true" onClick={onConnect} disabled={busy}>
              {(isConnecting || isRefreshing) && <span className={styles.spinner} aria-hidden="true" />}
              {isConnecting ? t('stripeGate.opening') : isRefreshing ? t('stripeGate.refreshing') : t(`stripeGate.${state}.action`)}
              {!busy && opensStripe && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg>}
            </button>
            {known && state !== 'none' && state !== 'pending' && <button type="button" className={styles.refresh} onClick={onRefresh} disabled={busy}>{t('stripeGate.refresh')}</button>}
            <p className={styles.actionNote}>{t(opensStripe ? 'stripeGate.note' : 'stripeGate.statusNote')}</p>
          </div>
        </section>
      </div>
    </div>, document.body,
  )
}
