import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

/** none — счёта Stripe нет вовсе; incomplete — есть, но приём ещё не включён;
 *  disabled — приём включён Stripe, но выключен тумблером на Финансах;
 *  loading — статус у Stripe ещё спрашивается (запрос идёт наружу, не мгновенный). */
export type StripeGateState = 'loading' | 'none' | 'incomplete' | 'disabled'

interface Props {
  state: StripeGateState
  isConnecting: boolean
  onConnect(): void
  onClose(): void
}

export function StripeGateModal({ state, isConnecting, onConnect, onClose }: Props) {
  const { t } = useTranslation('booking')
  const busy = state === 'loading' || isConnecting

  return createPortal(
    <div className="tg-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tg-modal sg-modal">
        <button className="sg-close" onClick={onClose} aria-label={t('stripeGate.later')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        <div className="sg-hero">
          <span className="sg-ring"/>
          <span className="sg-ring sg-ring-delayed"/>
          <div className="sg-tile">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="3"/>
              <line x1="2" y1="10" x2="22" y2="10"/>
              <line x1="6" y1="15" x2="10" y2="15"/>
            </svg>
            <span className="sg-tile-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>
              </svg>
            </span>
          </div>
        </div>

        <div className="sg-kicker">{t('stripeGate.kicker')}</div>
        <div className="sg-title">{t(`stripeGate.${state}.title`)}</div>
        <div className="sg-sub">{t(`stripeGate.${state}.sub`)}</div>

        <div className="sg-perks">
          {(['direct', 'methods', 'fee'] as const).map(key => (
            <div className="sg-perk" key={key}>
              <span className="sg-perk-ico">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </span>
              <span>{t(`stripeGate.perks.${key}`)}</span>
            </div>
          ))}
        </div>

        <button className="sg-cta" onClick={onConnect} disabled={busy}>
          {busy && <span className="sg-spin"/>}
          {state === 'loading' ? t('stripeGate.loading.action') : t(`stripeGate.${state}.action`)}
        </button>
        <button className="sg-later" onClick={onClose}>{t('stripeGate.later')}</button>
        <div className="sg-note">{t('stripeGate.note')}</div>
      </div>
    </div>,
    document.body,
  )
}
