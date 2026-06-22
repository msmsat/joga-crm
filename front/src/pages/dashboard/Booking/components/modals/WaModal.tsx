import { IconWhatsApp } from '../ui/BookingIcons'

interface Props { onClose(): void }

export function WaModal({ onClose }: Props) {
  return (
    <div className="tg-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tg-modal">
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

        <div className="modal-sub" style={{ marginBottom: '16px' }}>
          Настройте автоответчик в WhatsApp Business для мгновенной отправки ссылки на запись.
        </div>

        <div className="wa-preview">
          <div className="wa-bubble">
            Здравствуйте! Хочу записаться в вашу студию. Подскажите свободное время?
            <span className="wa-time">10:42</span>
          </div>
          <div className="wa-bubble bot">
            Приветствуем! ✨ Вы можете выбрать время и записаться мгновенно по ссылке:<br/><br/>
            <span style={{ color: '#027EB5' }}>book.velora.studio/my-studio</span>
            <span className="wa-time">10:42</span>
          </div>
        </div>

        <button className="topbar-btn" style={{ width: '100%', justifyContent: 'center', marginTop: '16px', padding: '11px' }}>
          Подключить WhatsApp Business
        </button>
      </div>
    </div>
  )
}
