import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

export function ConfirmModal({ open, title, text, onConfirm, onCancel, danger = false }: {
  open: boolean; title: string; text: string;
  onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  const { t } = useTranslation('finances');
  if (!open) return null;

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(18, 18, 18, 0.45)',
      zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      animation: 'fadeIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) both',
      padding: '20px', boxSizing: 'border-box',
    }}>
      <div style={{
        background: '#1A1A1A', borderRadius: '16px', padding: '32px', width: '400px', maxWidth: '100%',
        boxShadow: danger
          ? '0 20px 50px -12px rgba(216, 140, 154, 0.25), 0 0 0 1px rgba(255,255,255,0.04)'
          : '0 20px 50px -12px rgba(249, 160, 139, 0.22), 0 0 0 1px rgba(255,255,255,0.04)',
        border: '1px solid rgba(255, 255, 255, 0.03)',
        animation: 'scaleUp 0.3s cubic-bezier(0.34, 1.3, 0.64, 1) both',
        fontFamily: "'Manrope', sans-serif",
      }}>
        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes scaleUp { from { transform: scale(0.95) translateY(10px); } to { transform: scale(1) translateY(0); } }
        `}</style>

        <div style={{
          width: '44px', height: '44px', borderRadius: '12px',
          background: danger ? 'rgba(216, 140, 154, 0.12)' : 'rgba(249, 160, 139, 0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: danger ? '#D88C9A' : '#F9A08B', marginBottom: '24px',
          boxShadow: danger ? '0 0 20px rgba(216, 140, 154, 0.1)' : '0 0 20px rgba(249, 160, 139, 0.1)',
        }}>
          {danger ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          )}
        </div>

        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', margin: '0 0 10px 0', letterSpacing: '-0.3px', lineHeight: 1.3 }}>
            {title}
          </h3>
          <p style={{ fontSize: '13.5px', color: '#999999', margin: 0, fontWeight: 400, lineHeight: 1.6 }}>
            {text}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ padding: '12px 22px', background: 'transparent', color: '#CCCCCC', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Manrope', sans-serif", transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'; }}
          >
            {t('confirmModal.cancel')}
          </button>
          <button
            onClick={onConfirm}
            style={{ padding: '12px 24px', background: danger ? '#D88C9A' : '#F9A08B', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: "'Manrope', sans-serif", boxShadow: danger ? '0 8px 24px rgba(216, 140, 154, 0.3)' : '0 8px 24px rgba(249, 160, 139, 0.25)', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.filter = 'brightness(1.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.filter = 'none'; }}
          >
            {danger ? t('confirmModal.delete') : t('confirmModal.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
