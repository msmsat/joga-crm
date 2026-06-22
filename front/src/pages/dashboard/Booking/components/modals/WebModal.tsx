import { IconWeb } from '../ui/BookingIcons'

interface Props { onClose(): void }

export function WebModal({ onClose }: Props) {
  return (
    <div className="tg-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="tg-modal">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'rgba(91,171,114,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5BAB72' }}>
              <IconWeb />
            </div>
            <div className="modal-title" style={{ marginBottom: 0 }}>Виджет на сайт</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: '4px', display: 'flex' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="modal-sub">Установите кнопку записи на любой сайт (Tilda, WordPress или кастомный код)</div>

        <div className="code-block">
          <div className="code-header">HTML / JavaScript</div>
          <pre>{`<script src="https://velora.studio/widget.js"></script>\n<script>\n  Velora.init({ studioId: 'my-studio' });\n</script>`}</pre>
          <button className="code-copy" onClick={() => alert('Код скопирован!')}>Копировать</button>
        </div>

        <div className="instruction-box" style={{ marginTop: '16px' }}>
          <div className="ins-step" style={{ marginBottom: 0 }}>
            <div className="ins-num" style={{ background: 'var(--accent)' }}>!</div>
            <div className="ins-text">Вставьте этот код перед закрывающим тегом <code>&lt;/body&gt;</code> на вашем сайте. Кнопка появится автоматически.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
