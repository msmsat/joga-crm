import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

export interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;              // красная кнопка + иконка-предупреждение (по умолчанию false — нейтральный)
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

// Общая модалка подтверждения на всё приложение (замена window.confirm).
// Пока onConfirm летит — кнопка в состоянии загрузки, модалка не закрывается;
// закрывается по успешному завершению, остаётся открытой при ошибке (тост покажет).
export function ConfirmModal({ title, message, confirmText, cancelText, danger = false, onConfirm, onClose }: ConfirmModalProps) {
  const { t } = useTranslation('common');
  const [busy, setBusy] = useState(false);

  // Esc закрывает (но не во время запроса — чтобы не бросить операцию на полпути).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const handleConfirm = async () => {
    if (busy) return;
    try {
      setBusy(true);
      await onConfirm();
      onClose();
    } catch {
      // Ошибку показывает вызывающий код (тост); модалка остаётся открытой.
      setBusy(false);
    }
  };

  const accent = danger ? '#D88C9A' : '#F9A08B';
  const accentDark = danger ? '#C07080' : '#E8886F';
  const accentRgb = danger ? '216,140,154' : '249,160,139';

  return createPortal(
    <div
      onClick={() => { if (!busy) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(26,26,26,0.3)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'cm-fadeIn 0.2s ease forwards', padding: '20px', boxSizing: 'border-box',
      }}
    >
      <style>{`
        @keyframes cm-fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cm-scaleUp { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes cm-spin    { to { transform: rotate(360deg); } }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card, #FFFFFF)', width: '100%', maxWidth: '400px',
          borderRadius: '24px', padding: '32px',
          boxShadow: '0 24px 48px -12px rgba(26,26,26,0.15), 0 0 0 1px rgba(26,26,26,0.04)',
          animation: 'cm-scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
          display: 'flex', flexDirection: 'column', gap: '24px',
          fontFamily: "'Manrope', sans-serif",
        }}
      >
        <div>
          <div style={{
            width: '52px', height: '52px', borderRadius: '50%', marginBottom: '20px',
            background: `linear-gradient(135deg, rgba(${accentRgb},0.2), rgba(${accentRgb},0.06))`,
            border: `1.5px solid rgba(${accentRgb},0.2)`, color: accentDark,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {danger ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            )}
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text, #1A1A1A)', letterSpacing: '-0.3px', marginBottom: '8px' }}>
            {title}
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text2, #666666)', lineHeight: 1.5 }}>
            {message}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              flex: 1, padding: '13px', background: 'rgba(26,26,26,0.04)', color: 'var(--text2, #666666)',
              border: '1.5px solid rgba(26,26,26,0.08)', borderRadius: '12px',
              fontSize: '14px', fontWeight: 700, cursor: busy ? 'default' : 'pointer',
              transition: 'all 0.2s', fontFamily: 'inherit', opacity: busy ? 0.5 : 1,
            }}
          >
            {cancelText ?? t('buttons.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            style={{
              flex: 1, padding: '13px',
              background: `linear-gradient(135deg, ${accent}, ${accentDark})`,
              color: '#FFFFFF', border: 'none', borderRadius: '12px',
              fontSize: '14px', fontWeight: 700, cursor: busy ? 'default' : 'pointer',
              transition: 'all 0.2s', boxShadow: `0 8px 24px rgba(${accentRgb},0.3)`, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            {busy && (
              <span style={{
                width: '15px', height: '15px', borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#FFFFFF',
                animation: 'cm-spin 0.6s linear infinite', display: 'inline-block',
              }} />
            )}
            {confirmText ?? t('buttons.delete')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
