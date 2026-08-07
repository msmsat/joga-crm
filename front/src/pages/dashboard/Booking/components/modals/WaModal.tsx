import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { IconWhatsApp } from '../ui/BookingIcons'

interface Props { connected: boolean; phone: string; onClose(): void }

export function WaModal({ connected, phone, onClose }: Props) {
  const { t } = useTranslation('booking')
  // Номер у студии один на всю CRM (интеграция wa_notify) и подключается в
  // Уведомлениях — здесь его можно только увидеть, поэтому обе кнопки ведут туда.
  const navigate = useNavigate()
  const goToNotifications = () => navigate('/dashboard/notifications')

  return createPortal(
    <div className="tg-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tg-modal wa-modal-wide">

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(37,211,102,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#25D366' }}>
              <IconWhatsApp />
            </div>
            <div className="modal-title" style={{ marginBottom: 0 }}>{t('wa.title')}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '4px', display: 'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {!connected && (
          <>
            <div className="modal-sub" style={{ marginBottom: '20px' }}>
              {t('wa.sub')}
            </div>

            {/* Phone illustration */}
            <div className="wa-phone-wrap">
              <div className="wa-phone-frame">
                <div className="wa-phone-status">
                  <span>9:41</span>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><rect x="2" y="8" width="4" height="14" rx="1"/><rect x="8" y="5" width="4" height="17" rx="1"/><rect x="14" y="2" width="4" height="20" rx="1"/></svg>
                    <svg width="12" height="10" viewBox="0 0 24 24" fill="white"><path d="M1.5 8.5C5.7 4.3 10.85 2 12 2s6.3 2.3 10.5 6.5"/><path d="M5 12c1.9-1.9 4.4-3 7-3s5.1 1.1 7 3"/><path d="M8.5 15.5C9.9 14.1 11 13.5 12 13.5s2.1.6 3.5 2"/><circle cx="12" cy="19" r="1.5" fill="white"/></svg>
                    <svg width="14" height="10" viewBox="0 0 28 14" fill="white"><rect x="0.5" y="0.5" width="22" height="13" rx="3.5" stroke="white" strokeOpacity="0.5" fill="none"/><rect x="2" y="2" width="18" height="10" rx="2" fill="white"/><path d="M24 5v4a2 2 0 0 0 0-4z"/></svg>
                  </div>
                </div>
                <div className="wa-phone-chat-header">
                  <div className="wa-phone-avatar">V</div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'white' }}>Velora Studio</div>
                    <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.75)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#4CFF91', display: 'inline-block' }}/>
                      {t('wa.online')}
                    </div>
                  </div>
                </div>
                <div className="wa-phone-body">
                  <div className="wa-bubble wa-bubble-in">
                    {t('wa.sampleIncoming')}<span className="wa-time">10:42</span>
                  </div>
                  <div className="wa-typing-dots"><span/><span/><span/></div>
                  <div className="wa-bubble wa-bubble-out bot">
                    {t('wa.sampleOutgoing')}<br/>
                    <span style={{ color: '#027EB5' }}>book.velora.studio</span>
                    <span className="wa-time">10:42</span>
                  </div>
                </div>
              </div>
              <div className="wa-phone-glow"/>
            </div>

            <button
              className="topbar-btn"
              style={{ width: '100%', justifyContent: 'center', marginTop: '20px', padding: '11px' }}
              onClick={goToNotifications}
            >
              <IconWhatsApp />
              {t('wa.connect')}
            </button>
          </>
        )}

        {connected && (
          <div className="tg-connected-view">
            <div className="tg-check-circle" style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)', boxShadow: '0 8px 24px rgba(37,211,102,0.35)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(37,211,102,0.12)', color: '#25D366', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: 600, marginBottom: '12px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#25D366', display: 'inline-block' }}/>
                {t('wa.connected')}
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
                WhatsApp Business
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
                {phone}
              </div>
            </div>

            <div className="tg-connected-info">
              <div className="tg-info-row">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>{t('wa.autoReplyActive')}</span>
              </div>
              <div className="tg-info-row">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                <span>{t('wa.instantLink')}</span>
              </div>
            </div>

            <button
              onClick={goToNotifications}
              style={{ width: '100%', padding: '11px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s', marginTop: '8px' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#F9A08B'; (e.currentTarget as HTMLButtonElement).style.color = '#F9A08B' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text2)' }}
            >
              {t('channels.manage')}
            </button>
          </div>
        )}

      </div>
    </div>,
  document.body
  )
}
