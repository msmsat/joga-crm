import { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface ModalShellProps {
  onClose: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'lg';           // sm: 460px одна колонка; lg: 860px, две колонки (left slot)
  left?: React.ReactNode;       // левая панель под иллюстрацию/превью (только size="lg")
  leftStyle?: React.CSSProperties; // переопределяет фон/паддинг левой панели (full-bleed hero)
  leftWidth?: string;           // ширина левой колонки, если 280px мало под превью
  maxWidth?: string;            // ширина карточки, если дефолт (460/860) не подходит
  closeOnBackdrop?: boolean;    // клик мимо закрывает (по умолчанию true)
  dismissible?: boolean;        // false — не закрыть ни Esc, ни кликом мимо (гейт)
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
export function ModalShell({ onClose, children, size = 'sm', left, leftStyle, leftWidth, maxWidth, closeOnBackdrop = true, dismissible = true }: ModalShellProps) {
  const [leaving, setLeaving] = useState(false);

  const requestClose = () => {
    if (leaving || !dismissible) return;
    setLeaving(true);
    setTimeout(onClose, EXIT_MS);
  };

  useEffect(() => {
    if (!dismissible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissible]);

  const isLg = size === 'lg';

  return createPortal(
    <div
      className={leaving ? 'v-overlay is-leaving' : 'v-overlay'}
      onClick={() => { if (closeOnBackdrop) requestClose(); }}
    >
      <div
        className={isLg ? 'v-modal v-modal-lg' : 'v-modal'}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card, #FDFCFB)', borderRadius: isLg ? '24px' : '20px',
          boxShadow: '0 40px 100px rgba(26,26,26,0.18), 0 8px 32px rgba(26,26,26,0.07)',
          overflow: 'hidden',
          // Двухколоночная раскладка живёт в .v-modal-lg (App.css), а не инлайном:
          // инлайн-стиль перебивает медиазапросы, и на узких экранах колонки
          // было нечем перестроить. Наружу торчат только размеры-переменные.
          ...(isLg
            ? {
                ['--v-modal-w' as string]: maxWidth ?? '860px',
                ['--v-left-w' as string]: leftWidth ?? '280px',
              }
            : {
                width: '100%', maxWidth: maxWidth ?? '460px',
                maxHeight: 'calc(100vh - 32px)',
                display: 'flex', flexDirection: 'column',
              }),
        }}
      >
        <CloseContext.Provider value={requestClose}>
          {isLg && (
            <div
              className="v-modal-left ms-scroll"
              style={{
                background: 'var(--card, #FFFFFF)', padding: '36px 30px 28px',
                display: 'flex', flexDirection: 'column',
                // Панель скроллится сама, если превью не влезло по высоте.
                // safe center — чтобы при переполнении не срезалась её шапка.
                // overflow-x:hidden обязателен: при overflow-y:auto браузер
                // повышает вторую ось до auto, и любая тень/декор, вылезшая
                // за край, дала бы горизонтальный скролл.
                minHeight: 0, overflowY: 'auto', overflowX: 'hidden', justifyContent: 'safe center',
                ...leftStyle,
              }}
            >
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
