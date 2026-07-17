import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  leaving: boolean;   // помечен на выход: играет exit-анимация, из DOM убираем по её концу
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VISIBLE_MS = 3000;   // пауза перед стартом exit-анимации
const EXIT_MS = 260;       // длительность exit-анимации (см. keyframes toastOut)

// Success — онтикс-плашка (как у Staff), error — dusty rose. Через переменные,
// чтобы плашка следовала за темой, а не хардкодила цвет.
const VARIANT_BG: Record<ToastVariant, string> = {
  success: 'var(--onyx, #1A1A1A)',
  info: 'var(--onyx, #1A1A1A)',
  error: 'var(--rose, #D88C9A)',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  // Полностью убрать из DOM (по завершении exit-анимации).
  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    timers.current.delete(id);
  }, []);

  // Пометить на выход — запускает exit-анимацию; DOM чистит onAnimationEnd.
  const startLeave = useCallback((id: number) => {
    setToasts(prev => prev.map(t => (t.id === id ? { ...t, leaving: true } : t)));
    // Страховка на случай, если onAnimationEnd не придёт (таб в фоне и т.п.).
    const fallback = setTimeout(() => remove(id), EXIT_MS + 100);
    timers.current.set(id, fallback);
  }, [remove]);

  const show = useCallback((message: string, variant: ToastVariant) => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, message, variant, leaving: false }]);
    const timer = setTimeout(() => startLeave(id), VISIBLE_MS);
    timers.current.set(id, timer);
  }, [startLeave]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current.clear(); }, []);

  const value: ToastContextValue = {
    success: useCallback((msg: string) => show(msg, 'success'), [show]),
    error: useCallback((msg: string) => show(msg, 'error'), [show]),
    info: useCallback((msg: string) => show(msg, 'info'), [show]),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <>
          <style>{`
            @keyframes toastIn {
              from { opacity: 0; transform: translateY(14px) scale(0.96); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes toastOut {
              from { opacity: 1; transform: translateY(0) scale(1); }
              to   { opacity: 0; transform: translateY(10px) scale(0.98); }
            }
            .velora-toast {
              color: #fff;
              padding: 10px 18px;
              border-radius: 10px;
              font-size: 12px;
              font-weight: 600;
              white-space: nowrap;
              box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
              font-family: 'Manrope', sans-serif;
              pointer-events: auto;
              animation: toastIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both;
            }
            .velora-toast.leaving {
              animation: toastOut 0.26s ease forwards;
            }
          `}</style>
          <div
            style={{
              position: 'fixed',
              bottom: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 9999,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            {toasts.map(t => (
              <div
                key={t.id}
                className={`velora-toast${t.leaving ? ' leaving' : ''}`}
                style={{ background: VARIANT_BG[t.variant] }}
                onAnimationEnd={e => { if (t.leaving && e.animationName === 'toastOut') remove(t.id); }}
              >
                {t.message}
              </div>
            ))}
          </div>
        </>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
