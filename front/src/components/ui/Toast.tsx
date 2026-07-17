import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_CLOSE_MS = 3000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const show = useCallback((message: string, variant: ToastVariant) => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, message, variant }]);
    setTimeout(() => dismiss(id), AUTO_CLOSE_MS);
  }, [dismiss]);

  const value: ToastContextValue = {
    success: useCallback((msg: string) => show(msg, 'success'), [show]),
    error: useCallback((msg: string) => show(msg, 'error'), [show]),
    info: useCallback((msg: string) => show(msg, 'info'), [show]),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
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
              style={{
                background: t.variant === 'error' ? '#D88C9A' : '#1A1A1A',
                color: '#fff',
                padding: '10px 18px',
                borderRadius: '10px',
                fontSize: '12px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                opacity: 1,
                transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                fontFamily: 'Manrope, sans-serif',
              }}
            >
              {t.message}
            </div>
          ))}
        </div>,
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
