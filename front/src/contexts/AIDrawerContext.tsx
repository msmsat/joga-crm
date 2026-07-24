import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

interface AIDrawerContextValue {
  isOpen: boolean;
  showHistory: boolean;
  // Общая для дровера, страницы AI и AI-строки шапки (эпик AI-1, задача 7) —
  // один и тот же диалог виден на всех трёх поверхностях без F5.
  activeSessionId: number | null;
  setActiveSessionId: Dispatch<SetStateAction<number | null>>;
  open: () => void;
  close: () => void;
  toggle: () => void;
  enterHistory: () => void;
  exitHistory: () => void;
}

const AIDrawerContext = createContext<AIDrawerContextValue | null>(null);

export function AIDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);

  const open = () => setIsOpen(true);
  const close = () => { setIsOpen(false); setShowHistory(false); };
  const toggle = () => { if (isOpen) close(); else open(); };
  const enterHistory = () => setShowHistory(true);
  const exitHistory = () => setShowHistory(false);

  return (
    <AIDrawerContext.Provider value={{
      isOpen, showHistory, activeSessionId, setActiveSessionId,
      open, close, toggle, enterHistory, exitHistory,
    }}>
      {children}
    </AIDrawerContext.Provider>
  );
}

export function useAIDrawer() {
  const ctx = useContext(AIDrawerContext);
  if (!ctx) throw new Error('useAIDrawer must be used inside AIDrawerProvider');
  return ctx;
}
