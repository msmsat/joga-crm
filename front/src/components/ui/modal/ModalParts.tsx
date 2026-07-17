import { useModalClose } from './ModalShell';

// Шапка модалки: заголовок + крестик (крестик закрывает через анимацию Shell).
export function ModalHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const close = useModalClose();
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      padding: '22px 24px 16px', borderBottom: '1px solid var(--border, #F0EDE8)', flexShrink: 0,
    }}>
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text, #1A1A1A)', letterSpacing: '-0.5px', margin: 0 }}>
          {title}
        </h2>
        {subtitle && <p style={{ fontSize: '12px', color: '#AAA', margin: '4px 0 0' }}>{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={close}
        style={{
          width: '28px', height: '28px', background: 'rgba(26,26,26,0.05)', border: 'none',
          borderRadius: '8px', cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#AAA',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// Тело модалки: скролл-контейнер с отступами (поля кладутся сюда).
export function ModalBody({ children }: { children: React.ReactNode }) {
  return (
    <div className="ms-scroll" style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
      {children}
    </div>
  );
}

// Футер: Ghost (Отмена) + Primary (submit). По умолчанию Ghost закрывает модалку.
export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '10px', padding: '16px 24px', borderTop: '1px solid var(--border, #F0EDE8)', flexShrink: 0 }}>
      {children}
    </div>
  );
}

export function GhostButton({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  const close = useModalClose();
  return (
    <button
      type="button"
      onClick={onClick ?? close}
      style={{
        padding: '12px 18px', background: 'transparent',
        border: '1.5px solid var(--border2, #EEEBE6)', borderRadius: '12px',
        fontSize: '13px', fontWeight: 600, color: 'var(--text2, #888)',
        cursor: 'pointer', fontFamily: 'Manrope, sans-serif',
      }}
    >
      {children}
    </button>
  );
}

export function PrimaryButton({ onClick, disabled, loading, children }: {
  onClick: () => void; disabled?: boolean; loading?: boolean; children: React.ReactNode;
}) {
  const off = disabled || loading;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off}
      style={{
        flex: 1, padding: '12px 20px',
        background: 'linear-gradient(135deg, #FCAE91, #F9A08B)',
        border: 'none', borderRadius: '12px',
        fontSize: '14px', fontWeight: 700, color: 'white',
        cursor: off ? 'not-allowed' : 'pointer',
        fontFamily: 'Manrope, sans-serif', opacity: off ? 0.5 : 1,
        boxShadow: '0 8px 24px rgba(252,174,145,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
      }}
    >
      {loading && (
        <span style={{
          width: '15px', height: '15px', borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff',
          animation: 'cm-spin 0.6s linear infinite', display: 'inline-block',
        }} />
      )}
      <style>{`@keyframes cm-spin { to { transform: rotate(360deg); } }`}</style>
      {children}
    </button>
  );
}
