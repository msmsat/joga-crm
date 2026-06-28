import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { IconWhatsApp } from '../ui/BookingIcons'

type Step = 'default' | 'qr' | 'connected'

interface Props { onClose(): void }

export function WaModal({ onClose }: Props) {
  const [step, setStep] = useState<Step>('default')

  useEffect(() => {
    if (step !== 'qr') return
    const id = setTimeout(() => setStep('connected'), 3000)
    return () => clearTimeout(id)
  }, [step])

  return createPortal(
    <div className="tg-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tg-modal wa-modal-wide">

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(37,211,102,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#25D366' }}>
              <IconWhatsApp />
            </div>
            <div className="modal-title" style={{ marginBottom: 0 }}>WhatsApp запись</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '4px', display: 'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {step === 'default' && (
          <>
            <div className="modal-sub" style={{ marginBottom: '20px' }}>
              Настройте автоответчик в WhatsApp Business для мгновенной отправки ссылки на запись.
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
                      в сети
                    </div>
                  </div>
                </div>
                <div className="wa-phone-body">
                  <div className="wa-bubble wa-bubble-in">
                    Здравствуйте! Хочу записаться.<span className="wa-time">10:42</span>
                  </div>
                  <div className="wa-typing-dots"><span/><span/><span/></div>
                  <div className="wa-bubble wa-bubble-out bot">
                    Приветствуем! ✨<br/>
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
              onClick={() => setStep('qr')}
            >
              <IconWhatsApp />
              Подключить WhatsApp Business
            </button>
          </>
        )}

        {step === 'qr' && (
          <div className="wa-qr-view">
            <div className="wa-qr-wrap">
              {/* Decorative QR code SVG */}
              <svg className="wa-qr-svg" width="160" height="160" viewBox="0 0 160 160" fill="none">
                {/* Corner squares */}
                <rect x="10" y="10" width="44" height="44" rx="6" fill="currentColor"/>
                <rect x="16" y="16" width="32" height="32" rx="4" fill="var(--bg)"/>
                <rect x="22" y="22" width="20" height="20" rx="2" fill="currentColor"/>

                <rect x="106" y="10" width="44" height="44" rx="6" fill="currentColor"/>
                <rect x="112" y="16" width="32" height="32" rx="4" fill="var(--bg)"/>
                <rect x="118" y="22" width="20" height="20" rx="2" fill="currentColor"/>

                <rect x="10" y="106" width="44" height="44" rx="6" fill="currentColor"/>
                <rect x="16" y="112" width="32" height="32" rx="4" fill="var(--bg)"/>
                <rect x="22" y="118" width="20" height="20" rx="2" fill="currentColor"/>

                {/* Data dots pattern */}
                {[
                  [66,10],[72,10],[78,10],[84,10],[90,10],[96,10],
                  [66,16],[78,16],[90,16],
                  [66,22],[72,22],[84,22],[96,22],
                  [66,28],[78,28],[84,28],[90,28],
                  [66,34],[72,34],[78,34],[96,34],
                  [66,40],[84,40],[90,40],[96,40],
                  [66,46],[72,46],[78,46],[84,46],
                  [10,66],[16,66],[22,66],[28,66],[34,66],[40,66],[46,66],
                  [10,72],[28,72],[40,72],[46,72],
                  [10,78],[16,78],[22,78],[34,78],[40,78],
                  [10,84],[22,84],[28,84],[46,84],
                  [10,90],[16,90],[28,90],[34,90],[40,90],[46,90],
                  [10,96],[16,96],[22,96],[40,96],
                  [10,102],[28,102],[34,102],[46,102],
                  [66,66],[72,66],[84,66],[96,66],[102,66],[108,66],
                  [66,72],[78,72],[84,72],[96,72],[108,72],
                  [66,78],[72,78],[90,78],[96,78],[102,78],
                  [66,84],[78,84],[84,84],[102,84],[108,84],
                  [66,90],[72,90],[78,90],[84,90],[96,90],
                  [66,96],[84,96],[90,96],[102,96],[108,96],
                  [66,102],[72,102],[78,102],[90,102],[96,102],
                  [66,108],[72,108],[84,108],[90,108],[102,108],
                  [66,114],[78,114],[84,114],[96,114],[102,114],[108,114],
                  [66,120],[72,120],[84,120],[96,120],
                  [66,126],[78,126],[84,126],[90,126],[102,126],[108,126],
                  [66,132],[72,132],[90,132],[96,132],[102,132],
                  [66,138],[78,138],[84,138],[96,138],[102,138],[108,138],
                  [66,144],[72,144],[78,144],[84,144],[90,144],
                  [106,66],[112,66],[118,66],[124,66],[130,66],[136,66],[142,66],[148,66],
                  [106,72],[112,72],[130,72],[136,72],[142,72],
                  [106,78],[118,78],[124,78],[130,78],[148,78],
                  [106,84],[112,84],[118,84],[136,84],[142,84],[148,84],
                  [106,90],[124,90],[130,90],[136,90],
                  [106,96],[112,96],[118,96],[130,96],[136,96],[148,96],
                  [106,102],[112,102],[124,102],[136,102],[142,102],
                  [106,108],[118,108],[124,108],[130,108],[136,108],[148,108],
                ].map(([x, y], i) => (
                  <rect key={i} x={x} y={y} width="4" height="4" rx="1" fill="currentColor"/>
                ))}
              </svg>
              {/* Scanning line */}
              <div className="wa-qr-scan-line"/>
              {/* Corner brackets */}
              <div className="wa-qr-corner wa-qr-corner-tl"/>
              <div className="wa-qr-corner wa-qr-corner-tr"/>
              <div className="wa-qr-corner wa-qr-corner-bl"/>
              <div className="wa-qr-corner wa-qr-corner-br"/>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px' }}>
                Отсканируйте QR-код
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.5 }}>
                WhatsApp Business → Настройки →<br/>Связанные устройства
              </div>
            </div>

            <div className="wa-qr-progress">
              <div className="wa-qr-progress-bar"/>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', textAlign: 'center' }}>
              Ожидание подключения...
            </div>
          </div>
        )}

        {step === 'connected' && (
          <div className="tg-connected-view">
            <div className="tg-check-circle" style={{ background: 'linear-gradient(135deg, #25D366, #128C7E)', boxShadow: '0 8px 24px rgba(37,211,102,0.35)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(37,211,102,0.12)', color: '#25D366', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: 600, marginBottom: '12px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#25D366', display: 'inline-block' }}/>
                Подключён
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
                WhatsApp Business
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
                +7 (999) 123-45-67
              </div>
            </div>

            <div className="tg-connected-info">
              <div className="tg-info-row">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>Автоответ активен</span>
              </div>
              <div className="tg-info-row">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                <span>Ссылка на запись отправляется мгновенно</span>
              </div>
            </div>

            <button
              onClick={() => setStep('default')}
              style={{ width: '100%', padding: '11px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s', marginTop: '8px' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#D88C9A'; (e.currentTarget as HTMLButtonElement).style.color = '#D88C9A' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text2)' }}
            >
              Отключить
            </button>
          </div>
        )}

      </div>
    </div>,
  document.body
  )
}
