import { createPortal } from 'react-dom';
import { IconInstagram } from '../ui/BookingIcons'

interface Props { onClose(): void }

export function InstaModal({ onClose }: Props) {
  return createPortal(
    <div className="tg-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tg-modal">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(201,107,158,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C96B9E' }}>
              <IconInstagram />
            </div>
            <div className="modal-title" style={{ marginBottom: 0 }}>Instagram Bio</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '4px', display: 'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="modal-sub" style={{ marginBottom: '16px' }}>
          Разместите ссылку для быстрой записи клиентов в профиле и историях
        </div>

        <div className="instruction-box">
          <div className="ins-step">
            <div className="ins-num">1</div>
            <div style={{ flex: 1 }}>
              <div className="ins-text"><strong>Скопируйте вашу ссылку</strong></div>
              <div className="link-copy-block" onClick={() => { navigator.clipboard.writeText('book.velora.studio/my-studio'); alert('Ссылка скопирована!') }}>
                <span>book.velora.studio/my-studio</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
              </div>
            </div>
          </div>
          <div className="ins-step">
            <div className="ins-num">2</div>
            <div className="ins-text">Вставьте её в поле <strong>"Сайт"</strong> (Website) в настройках профиля Instagram.</div>
          </div>
          <div className="ins-step">
            <div className="ins-num">3</div>
            <div className="ins-text">Добавляйте ссылку в <strong>Stories</strong> через специальный стикер.</div>
          </div>
        </div>

        <div className="pro-tip">
          <span className="pro-badge">PRO TIP</span>
          Закрепите Story с процессом записи в Highlights — это повышает конверсию на 30%.
        </div>
      </div>
    </div>,
  document.body
  )
}
