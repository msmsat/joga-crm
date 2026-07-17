import { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ModalShellProps {
  onClose: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'lg';           // sm: 460px одна колонка; lg: 860px, две колонки (left slot)
  left?: React.ReactNode;       // левая панель под иллюстрацию/превью (только size="lg")
  closeOnBackdrop?: boolean;    // клик мимо закрывает (по умолчанию true)
}

const EXIT_MS = 200;

// Анимированное закрытие доступно детям (крестик в Header, «Отмена» в Footer),
// чтобы любая кнопка закрытия проигрывала exit-анимацию, а не рвала модалку.
const CloseContext = createContext<() => void>(() => {});
export const useModalClose = () => useContext(CloseContext);

// Каркас всех модалок кита: overlay с blur, вход (scale+translateY, пружина) и
// ВЫХОД (плавное закрытие — раньше все модалки исчезали мгновенно), Esc и клик
// мимо. Содержимое (Header/поля/Footer) передаётся как children.
export function ModalShell({ onClose, children, size = 'sm', left, closeOnBackdrop = true }: ModalShellProps) {
  const [leaving, setLeaving] = useState(false);

  const requestClose = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onClose, EXIT_MS);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLg = size === 'lg';

  return createPortal(
    <div
      onClick={() => { if (closeOnBackdrop) requestClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(26,26,26,0.42)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box',
        animation: leaving ? 'ms-overlayOut 0.2s ease forwards' : 'ms-overlayIn 0.22s ease',
      }}
    >
      <style>{`
        @keyframes ms-overlayIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ms-overlayOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes ms-modalIn    { from { opacity: 0; transform: scale(0.94) translateY(16px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes ms-modalOut   { from { opacity: 1; transform: scale(1) translateY(0); } to { opacity: 0; transform: scale(0.97) translateY(8px); } }
        .ms-scroll::-webkit-scrollbar { width: 3px; }
        .ms-scroll::-webkit-scrollbar-thumb { background: rgba(249,160,139,0.25); border-radius: 3px; }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: isLg ? '860px' : '460px',
          maxHeight: 'calc(100vh - 32px)',
          background: 'var(--bg-card, #FDFCFB)', borderRadius: isLg ? '24px' : '20px',
          boxShadow: '0 40px 100px rgba(26,26,26,0.18), 0 8px 32px rgba(26,26,26,0.07)',
          overflow: 'hidden',
          animation: leaving
            ? 'ms-modalOut 0.2s ease forwards'
            : 'ms-modalIn 0.32s cubic-bezier(0.34,1.1,0.64,1)',
          ...(isLg
            ? { display: 'grid', gridTemplateColumns: '280px 1fr' }
            : { display: 'flex', flexDirection: 'column' }),
        }}
      >
        <CloseContext.Provider value={requestClose}>
          {isLg && (
            <div style={{ background: 'var(--card, #FFFFFF)', padding: '36px 30px 28px', display: 'flex', flexDirection: 'column' }}>
              {left}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
            {children}
          </div>
        </CloseContext.Provider>
      </div>
    </div>,
    document.body
  );
}
