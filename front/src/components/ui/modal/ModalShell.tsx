import { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ModalShellProps {
  onClose: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'lg';           // sm: 460px одна колонка; lg: 860px, две колонки (left slot)
  left?: React.ReactNode;       // левая панель под иллюстрацию/превью (только size="lg")
  leftStyle?: React.CSSProperties; // переопределяет фон/паддинг левой панели (full-bleed hero)
  maxWidth?: string;            // ширина карточки, если дефолт (460/860) не подходит
  closeOnBackdrop?: boolean;    // клик мимо закрывает (по умолчанию true)
}

const EXIT_MS = 200;

// Анимированное закрытие доступно детям (крестик в Header, «Отмена» в Footer),
// чтобы любая кнопка закрытия проигрывала exit-анимацию, а не рвала модалку.
const CloseContext = createContext<() => void>(() => {});
export const useModalClose = () => useContext(CloseContext);

// Каркас всех модалок кита: затемняющий overlay, вход и ВЫХОД (плавное
// закрытие — раньше все модалки исчезали мгновенно), Esc и клик мимо.
// Содержимое (Header/поля/Footer) передаётся как children.
// Анимация — в классах .v-overlay / .v-modal (App.css). Без backdrop-filter:
// блюр во весь вьюпорт и был причиной лагов открытия (см. комментарий там).
export function ModalShell({ onClose, children, size = 'sm', left, leftStyle, maxWidth, closeOnBackdrop = true }: ModalShellProps) {
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
      className={leaving ? 'v-overlay is-leaving' : 'v-overlay'}
      onClick={() => { if (closeOnBackdrop) requestClose(); }}
    >
      <div
        className="v-modal"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: maxWidth ?? (isLg ? '860px' : '460px'),
          maxHeight: 'calc(100vh - 32px)',
          background: 'var(--bg-card, #FDFCFB)', borderRadius: isLg ? '24px' : '20px',
          boxShadow: '0 40px 100px rgba(26,26,26,0.18), 0 8px 32px rgba(26,26,26,0.07)',
          overflow: 'hidden',
          ...(isLg
            ? { display: 'grid', gridTemplateColumns: '280px 1fr' }
            : { display: 'flex', flexDirection: 'column' }),
        }}
      >
        <CloseContext.Provider value={requestClose}>
          {isLg && (
            <div style={{ background: 'var(--card, #FFFFFF)', padding: '36px 30px 28px', display: 'flex', flexDirection: 'column', ...leftStyle }}>
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
