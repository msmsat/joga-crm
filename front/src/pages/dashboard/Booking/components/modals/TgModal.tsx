import { IconTelegram } from '../ui/BookingIcons'

interface Props { onClose(): void }

export function TgModal({ onClose }: Props) {
  return (
    <div className="tg-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tg-modal">
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
        <div className="modal-sub">Вставьте токен бота из @BotFather</div>
        <input className="input-field" type="text" placeholder="123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ" style={{ marginBottom: '16px' }} />
        <button className="topbar-btn" style={{ width: '100%', justifyContent: 'center', padding: '11px' }}>Подключить бота</button>
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
      </div>
    </div>
  )
}
