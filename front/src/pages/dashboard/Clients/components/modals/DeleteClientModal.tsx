export interface DeleteClientModalProps {
  isOpen: boolean;
  clientName: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeleteClientModal({ isOpen, clientName, onConfirm, onClose }: DeleteClientModalProps) {
  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes dcFadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes dcScaleUp { from { opacity: 0; transform: scale(0.92) translateY(12px) } to { opacity: 1; transform: scale(1) translateY(0) } }
      `}</style>

      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'dcFadeIn 0.2s ease both',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: '#fff', borderRadius: '20px', padding: '36px 32px',
            maxWidth: '400px', width: '100%', margin: '0 16px',
            boxShadow: '0 32px 80px -16px rgba(26,26,26,0.22)',
            animation: 'dcScaleUp 0.28s cubic-bezier(0.34,1.56,0.64,1) both',
            textAlign: 'center',
          }}
        >
          {/* Warning icon */}
          <div style={{
            width: '60px', height: '60px', borderRadius: '16px',
            background: 'rgba(216,140,154,0.12)',
            border: '1px solid rgba(216,140,154,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D88C9A" strokeWidth="1.8" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>

          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.4px', marginBottom: '8px' }}>
            Удалить клиента?
          </div>

          <div style={{ fontSize: '13px', color: 'var(--text3)', lineHeight: 1.6, marginBottom: '6px' }}>
            Вы собираетесь удалить клиента
          </div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)', marginBottom: '16px' }}>
            «{clientName}»
          </div>
          <div style={{ fontSize: '12px', color: '#D88C9A', fontWeight: 600, marginBottom: '28px' }}>
            Это действие нельзя отменить.
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '12px', borderRadius: '12px',
                border: '1px solid var(--border)', background: 'transparent',
                fontSize: '13px', fontWeight: 700, color: 'var(--text3)',
                cursor: 'pointer', fontFamily: "'Manrope',sans-serif", transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text2)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text3)'; }}
            >
              Отмена
            </button>
            <button
              onClick={() => { onConfirm(); onClose(); }}
              style={{
                flex: 1, padding: '12px', borderRadius: '12px',
                border: 'none', background: 'linear-gradient(135deg,#D88C9A,#c07080)',
                fontSize: '13px', fontWeight: 700, color: '#fff',
                cursor: 'pointer', fontFamily: "'Manrope',sans-serif",
                boxShadow: '0 4px 14px -2px rgba(216,140,154,0.4)', transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.06)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.filter = ''; e.currentTarget.style.transform = ''; }}
            >
              Удалить
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
