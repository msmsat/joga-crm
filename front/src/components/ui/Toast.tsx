import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type ToastVariant = 'success' | 'error' | 'info' | 'undo';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  leaving: boolean;   // помечен на выход: играет exit-анимация, из DOM убираем по её концу
  duration?: number;  // undo: длительность таймера (для CSS-анимации прогресс-полоски)
  actionLabel?: string; // undo: текст кнопки
}

export interface UndoToastOptions {
  onUndo: () => void;      // клик «Отменить»
  onExpire?: () => void;   // таймер истёк — отложенный коммит (V4-3, задача 5)
  duration?: number;       // мс, по умолчанию 5000
  actionLabel?: string;    // по умолчанию «Отменить»
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  undo: (message: string, opts: UndoToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VISIBLE_MS = 3000;   // пауза перед стартом exit-анимации
const UNDO_MS = 5000;      // таймер undo-тоста (решение владельца 2026-07-14)
const EXIT_MS = 260;       // длительность exit-анимации (см. keyframes toastOut)

// Success — онтикс-плашка (как у Staff), error — dusty rose. Через переменные,
// чтобы плашка следовала за темой, а не хардкодила цвет.
const VARIANT_BG: Record<ToastVariant, string> = {
  success: 'var(--onyx, #1A1A1A)',
  info: 'var(--onyx, #1A1A1A)',
  undo: 'var(--onyx, #1A1A1A)',
  error: 'var(--rose, #D88C9A)',
};

// Живое состояние undo-тоста (колбэки + пауза таймера по hover). В ref, а не в
// state: колбэки и остаток времени не влияют на рендер. Удаление из map = тост
// уже разрешился (клик/истечение) — все обработчики после этого no-op.
interface UndoMeta {
  onUndo: () => void;
  onExpire?: () => void;
  remaining: number;   // мс до истечения (без учёта текущего отрезка)
  startedAt: number;   // Date.now() старта текущего отрезка таймера
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const undoMeta = useRef<Map<number, UndoMeta>>(new Map());

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

  // Истечение таймера undo-тоста: коммит отложенной операции (onExpire) + выход.
  const expireUndo = useCallback((id: number) => {
    const meta = undoMeta.current.get(id);
    if (!meta) return; // уже разрешился кликом
    undoMeta.current.delete(id);
    clearTimeout(timers.current.get(id));
    meta.onExpire?.();
    startLeave(id);
  }, [startLeave]);

  const undo = useCallback((message: string, opts: UndoToastOptions) => {
    // «Отменить» всегда относится к последней операции: живой старый undo-тост
    // немедленно коммитится (его onExpire) и уходит — очередь не копим.
    [...undoMeta.current.keys()].forEach(expireUndo);

    const id = nextId.current++;
    const duration = opts.duration ?? UNDO_MS;
    undoMeta.current.set(id, {
      onUndo: opts.onUndo, onExpire: opts.onExpire,
      remaining: duration, startedAt: Date.now(),
    });
    setToasts(prev => [...prev, {
      id, message, variant: 'undo', leaving: false,
      duration, actionLabel: opts.actionLabel ?? 'Отменить',
    }]);
    timers.current.set(id, setTimeout(() => expireUndo(id), duration));
  }, [expireUndo]);

  // Клик «Отменить»: откат без коммита (onExpire не зовём).
  const clickUndo = useCallback((id: number) => {
    const meta = undoMeta.current.get(id);
    if (!meta) return;
    undoMeta.current.delete(id);
    clearTimeout(timers.current.get(id));
    meta.onUndo();
    startLeave(id);
  }, [startLeave]);

  // Hover ставит таймер на паузу: пользователь целится в кнопку, тост не должен
  // сбежать. CSS :hover синхронно паузит прогресс-полоску (animation-play-state).
  const pauseUndo = useCallback((id: number) => {
    const meta = undoMeta.current.get(id);
    if (!meta) return;
    clearTimeout(timers.current.get(id));
    meta.remaining -= Date.now() - meta.startedAt;
  }, []);

  const resumeUndo = useCallback((id: number) => {
    const meta = undoMeta.current.get(id);
    if (!meta) return;
    meta.startedAt = Date.now();
    timers.current.set(id, setTimeout(() => expireUndo(id), Math.max(meta.remaining, 0)));
  }, [expireUndo]);

  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current.clear(); }, []);

  const value: ToastContextValue = {
    success: useCallback((msg: string) => show(msg, 'success'), [show]),
    error: useCallback((msg: string) => show(msg, 'error'), [show]),
    info: useCallback((msg: string) => show(msg, 'info'), [show]),
    undo,
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
              position: relative;
              overflow: hidden;
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
            .velora-toast .undo-action {
              background: none;
              border: none;
              padding: 0;
              margin-left: 14px;
              color: var(--peach, #FCAE91);
              font: inherit;
              font-weight: 700;
              cursor: pointer;
            }
            .velora-toast .undo-action:hover { color: #F9A08B; }
            @keyframes undoProgress { from { width: 100%; } to { width: 0; } }
            .velora-toast .undo-progress {
              position: absolute;
              left: 0;
              bottom: 0;
              height: 2px;
              background: var(--peach, #FCAE91);
              animation-name: undoProgress;
              animation-timing-function: linear;
              animation-fill-mode: forwards;
            }
            /* Пауза полоски по hover — синхронно с JS-паузой таймера. */
            .velora-toast:hover .undo-progress { animation-play-state: paused; }
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
                onMouseEnter={t.variant === 'undo' ? () => pauseUndo(t.id) : undefined}
                onMouseLeave={t.variant === 'undo' ? () => resumeUndo(t.id) : undefined}
              >
                {t.message}
                {t.variant === 'undo' && (
                  <>
                    <button type="button" className="undo-action" onClick={() => clickUndo(t.id)}>
                      {t.actionLabel}
                    </button>
                    <div className="undo-progress" style={{ animationDuration: `${t.duration}ms` }} />
                  </>
                )}
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
