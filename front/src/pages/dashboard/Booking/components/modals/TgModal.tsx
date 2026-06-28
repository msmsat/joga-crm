import { useState } from 'react'
import { createPortal } from 'react-dom'
import { IconTelegram } from '../ui/BookingIcons'

interface Props {
  connected: boolean
  botName: string
  token: string
  onConnect(token: string): void
  onDisconnect(): void
  onClose(): void
}

function maskToken(token: string) {
  const [id, key = ''] = token.split(':')
  if (!key) return token
  return `${id}:${'•'.repeat(Math.max(0, key.length - 6))}${key.slice(-6)}`
}

export function TgModal({ connected, botName, token, onConnect, onDisconnect, onClose }: Props) {
  const [inputVal, setInputVal] = useState('')

  return createPortal(
    <div className="tg-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tg-modal">

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(74,128,196,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A80C4' }}>
              <IconTelegram />
            </div>
            <div className="modal-title" style={{ marginBottom: 0 }}>Telegram-бот</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '4px', display: 'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {connected ? (
          /* ── View B: Connected ── */
          <div className="tg-connected-view">
            <div className="tg-check-circle">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(91,171,114,0.12)', color: '#5BAB72', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', fontWeight: 600, marginBottom: '12px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#5BAB72', display: 'inline-block' }}/>
                Подключён
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
                @{botName}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'monospace', letterSpacing: '0.03em' }}>
                {maskToken(token)}
              </div>
            </div>

            <div className="tg-connected-info">
              <div className="tg-info-row">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5BAB72" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12"/><path d="M16.72 16.72A9 9 0 0 1 3 3l18 18"/></svg>
                <span>Бот принимает записи от клиентов</span>
              </div>
              <div className="tg-info-row">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5BAB72" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>Уведомления приходят мгновенно</span>
              </div>
            </div>

            <button
              onClick={onDisconnect}
              style={{ width: '100%', padding: '11px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.15s', marginTop: '8px' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#D88C9A'; (e.currentTarget as HTMLButtonElement).style.color = '#D88C9A' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text2)' }}
            >
              Отключить бота
            </button>
          </div>
        ) : (
          /* ── View A: Input form ── */
          <>
            <div className="modal-sub">Вставьте токен бота из @BotFather</div>
            <input
              className="input-field"
              type="text"
              placeholder="123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              style={{ marginBottom: '16px' }}
            />
            <button
              className="topbar-btn"
              style={{ width: '100%', justifyContent: 'center', padding: '11px', opacity: inputVal.trim() ? 1 : 0.5, cursor: inputVal.trim() ? 'pointer' : 'not-allowed' }}
              onClick={() => { if (inputVal.trim()) onConnect(inputVal.trim()) }}
            >
              Подключить бота
            </button>
            <div className="instruction-box" style={{ marginTop: '16px' }}>
              <div className="ins-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Как получить токен?
              </div>
              <ol>
                <li>Откройте Telegram → найдите <strong>@BotFather</strong></li>
                <li>Отправьте команду <code>/newbot</code></li>
                <li>Придумайте имя и username для бота</li>
                <li>Скопируйте токен и вставьте выше</li>
              </ol>
            </div>
          </>
        )}
      </div>
    </div>,
  document.body
  )
}
