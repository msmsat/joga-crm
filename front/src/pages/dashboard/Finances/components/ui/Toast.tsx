import type { ToastType } from '../../types';

export function Toast({ msg, type, visible }: { msg: string; type: ToastType; visible: boolean }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: '32px',
      left: '50%',
      transform: `translateX(-50%) translateY(${visible ? 0 : 20}px)`,
      background: '#1A1A1A',
      color: '#FFFFFF',
      padding: '14px 20px',
      borderRadius: '12px',
      fontSize: '13px',
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      opacity: visible ? 1 : 0,
      transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
      pointerEvents: 'none',
      zIndex: 99998,
      boxShadow: '0 16px 40px rgba(0,0,0,0.2)',
      fontFamily: "'Manrope', sans-serif",
    }}>
      {type === 'success' && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A3C9A8" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
      )}
      {type === 'error' && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D88C9A" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      )}
      {type === 'info' && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7EB5D6" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      )}
      {msg}
    </div>
  );
}
