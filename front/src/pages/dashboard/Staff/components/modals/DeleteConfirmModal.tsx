
export interface DeleteConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  dontAsk?: boolean;
  onDontAskChange?: (value: boolean) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeleteConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Удалить',
  dontAsk,
  onDontAskChange,
  onConfirm,
  onClose,
}: DeleteConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(26,26,26,0.3)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'dm-fadeIn 0.2s ease forwards', padding: '20px', boxSizing: 'border-box',
      }}
    >
      <style>{`
        @keyframes dm-fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dm-scaleUp { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFFFFF', width: '100%', maxWidth: '400px',
          borderRadius: '24px', padding: '32px',
          boxShadow: '0 24px 48px -12px rgba(26,26,26,0.15), 0 0 0 1px rgba(26,26,26,0.04)',
          animation: 'dm-scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
          display: 'flex', flexDirection: 'column', gap: '24px',
          fontFamily: "'Manrope', sans-serif",
        }}
      >
        {/* Icon + texts */}
        <div>
          <div style={{
            width: '52px', height: '52px', borderRadius: '50%', marginBottom: '20px',
            background: 'linear-gradient(135deg, rgba(216,140,154,0.2), rgba(216,140,154,0.06))',
            border: '1.5px solid rgba(216,140,154,0.2)', color: '#C07080',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#1A1A1A', letterSpacing: '-0.3px', marginBottom: '8px' }}>
            {title}
          </div>
          <div style={{ fontSize: '14px', color: '#666666', lineHeight: 1.5 }}>
            {message}
          </div>
        </div>

        {/* Don't ask again (optional) */}
        {onDontAskChange !== undefined && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
            padding: '12px 16px', background: 'rgba(26,26,26,0.03)',
            borderRadius: '12px', border: '1px solid rgba(26,26,26,0.05)',
          }}>
            <div style={{
              width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
              border: `1.5px solid ${dontAsk ? '#1A1A1A' : 'rgba(26,26,26,0.2)'}`,
              background: dontAsk ? '#1A1A1A' : '#FFFFFF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s',
            }}>
              {dontAsk && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </div>
            <input
              type="checkbox"
              checked={!!dontAsk}
              onChange={e => onDontAskChange(e.target.checked)}
              style={{ display: 'none' }}
            />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A1A1A' }}>
              Больше не спрашивать при удалении
            </span>
          </label>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '13px', background: 'rgba(26,26,26,0.04)', color: '#666666',
              border: '1.5px solid rgba(26,26,26,0.08)', borderRadius: '12px',
              fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              transition: 'all 0.2s', fontFamily: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(26,26,26,0.07)'; e.currentTarget.style.color = '#1A1A1A'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(26,26,26,0.04)'; e.currentTarget.style.color = '#666666'; }}
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: '13px',
              background: 'linear-gradient(135deg, #D88C9A, #C07080)',
              color: '#FFFFFF', border: 'none', borderRadius: '12px',
              fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 8px 24px rgba(216,140,154,0.3)', fontFamily: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(216,140,154,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(216,140,154,0.3)'; }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
